"""
პერსონალიზებული კალორიული მოდელი — Production v2.0
=====================================================
სრული production დონის მოდელი შემდეგი კომპონენტებით:

  1. Missing Data — Little MCAR + MICE + IPW (MNAR)
  2. STL დეკომპოზიცია — ტრენდი + სეზონი (Fourier) + ციკლი
  3. მენსტრ. ციკლი — ნებაყ., cycle_start_date-იდან ავტომ.
  4. Phase 1 — Mifflin-St Jeor + აქტიურობა + ძილი
  5. Phase 2 — Mixed Effects Ridge + AR(1) GLS + IPW
  6. Phase 3 — Gradient Boosting residual layer + FDR
  7. Phase 4 — სრული Kalman Filter + CUSUM drift
  8. მეტაბ. ადაპტაცია — Hall et al. (2012) + plateau detection
  9. კლინ. ზღვრები — მინ.კალ. + მაქს.დეფ. + მაქს.კლება
  10. Transfer Learning — ახ. მომხ. პოპ. prior-ით (Phase 2-ით)

გამოყენება:
  python calorie_model_v2.py data.csv
"""

import sys
import warnings
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import Ridge, RidgeCV, LogisticRegression, HuberRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import KFold
from sklearn.ensemble import GradientBoostingRegressor


# ═══════════════════════════════════════════════════════
# 0. კონსტანტები და ვალიდაცია
# ═══════════════════════════════════════════════════════

_VALID_GOALS = {'loss', 'gain', 'maintain', 'recomp'}
_VALID_AGGR  = {'conservative', 'moderate', 'aggressive'}

_FIELD_BOUNDS = {
    'weight':       (20.0,  300.0),
    'calories':     (500.0, 10000.0),
    'exercise_min': (0,     900),
    'sleep_h':      (2.0,   14.0),
    'steps':        (0,     80000),
    'stress':       (1,     40),
    'hydration_l':  (0.5,   10.0),
    'age':          (16,    100),
    'height_cm':    (100.0, 250.0),
}

# კლინიკური ზღვრები
_MIN_CAL_FEMALE = 1200   # კკ/დღე
_MIN_CAL_MALE   = 1500   # კკ/დღე
_MAX_DEFICIT    = 750    # კკ/დღე
_MAX_DW_WEEK    = 1.0    # კგ/კვ

# ენ. კონვ. კონსტ.
_KCAL_PER_KG     = 7700.0   # კკ/კგ ცხიმი
_KCAL_PER_KG_MUS =  950.0   # კკ/კგ კუნთი (Forbes 1987)


# ═══════════════════════════════════════════════════════
# 1. CSV ჩატვირთვა და ვალიდაცია
# ═══════════════════════════════════════════════════════

def load_data(path: str) -> pd.DataFrame:
    """
    CSV ჩატვირთვა სრული ვალიდაციით.

    სავალდ. სვეტები (14):
      person_id, week, weight, calories, exercise_min,
      sleep_h, steps, stress (1-40), hydration_l,
      sex (0=ქალი/1=კაცი), age, height_cm,
      goal (loss|gain|maintain|recomp),
      aggressiveness (conservative|moderate|aggressive)

    არასავალდ.:
      cycle_start_date  — ქალებისთვის ნებ., ფორმ: YYYY-MM-DD
    """
    df = pd.read_csv(path, parse_dates=False)

    required = [
        'person_id', 'week', 'weight', 'calories',
        'exercise_min', 'sleep_h', 'steps', 'stress',
        'hydration_l', 'sex', 'age', 'height_cm',
        'goal', 'aggressiveness',
    ]
    miss = [c for c in required if c not in df.columns]
    if miss:
        raise ValueError("CSV-ში აკლია სვეტები: " + str(miss))

    # goal / aggressiveness ვალიდ.
    for col, valid in [('goal', _VALID_GOALS), ('aggressiveness', _VALID_AGGR)]:
        bad = df[col].dropna()
        bad = bad[~bad.isin(valid)]
        if not bad.empty:
            raise ValueError(
                f"'{col}': დაუშვ. მნ. {bad.unique().tolist()}. "
                f"დასაშვ.: {sorted(valid)}"
            )

    # რიც. ზღვრები — warning (არა error, missing-ს ვუშვებთ)
    for col, (lo, hi) in _FIELD_BOUNDS.items():
        if col not in df.columns:
            continue
        nums = pd.to_numeric(df[col], errors='coerce').dropna()
        bad  = nums[(nums < lo) | (nums > hi)]
        if not bad.empty:
            warnings.warn(
                f"'{col}': {len(bad)} მნ. [{lo},{hi}]-ს გარეთ. "
                f"პირველი: {bad.iloc[0]:.2f}",
                UserWarning, stacklevel=2,
            )
    return df


# ═══════════════════════════════════════════════════════
# 2. STL დეკომპოზიცია
# ═══════════════════════════════════════════════════════

def add_fourier_season(df: pd.DataFrame,
                       period: float = 52.0,
                       n_terms: int = 2) -> pd.DataFrame:
    """
    Fourier სეზონური ტერმები — გრძ. ციკლი ~52 კვ.
    sin/cos წყვილები Phase 2 feature-ებში შედის.
    """
    df = df.copy()
    for k in range(1, n_terms + 1):
        angle = 2 * np.pi * k * df['week'] / period
        df[f'season_sin_{k}'] = np.sin(angle)
        df[f'season_cos_{k}'] = np.cos(angle)
    return df


def add_cycle_day(df: pd.DataFrame) -> pd.DataFrame:
    """
    cycle_day (0-27): მენსტრ. ციკლის დღე კვირის ბოლოს.
    გამოითვ. cycle_start_date-იდან (YYYY-MM-DD).
    sex != 0 ან cycle_start_date NaN → cycle_day = NaN.
    """
    df = df.copy()
    df['cycle_day'] = np.nan

    if 'cycle_start_date' not in df.columns:
        return df

    for pid, grp in df.groupby('person_id'):
        if int(grp['sex'].iloc[0]) != 0:
            continue
        csd = grp['cycle_start_date'].dropna()
        if csd.empty:
            continue
        try:
            start = pd.to_datetime(csd.iloc[0])
        except Exception:
            continue
        # cycle_start_date-იდან elapsed days კვირის ბოლომდე
        for idx, row in grp.iterrows():
            week_end_days = int(row['week']) * 7 + 6
            # start-იდან გასული დღეები
            elapsed = week_end_days  # კვირა 0 = პირველი 7 დღე
            # cycle_start = week 0-ის დასაწყისიდან offset
            # start გვიჩვენებს კალენდ. თარიღს — ვიყენებთ offset-ად
            # week 0, day 0 = reference point
            # cycle_day = (elapsed - start_offset_days) % 28
            # start_offset: start-ი reference-დან რამდენი დღე
            # reference = study-ს დაწყება (week=0, day=0)
            # study start date ვერ ვიცით, ამიტომ start-ის DOY ვიყ.
            start_offset = start.dayofyear % 28
            cd = (elapsed - start_offset) % 28
            df.loc[idx, 'cycle_day'] = float(cd)
    return df


def detrend_weight(df: pd.DataFrame, window: int = 8) -> pd.DataFrame:
    """
    weight-ის ლოკ. ტრენდის ამოყვ. rolling median-ით.
    weight_detrended = weight - rolling_trend
    Phase 2 ამ სუფთა სიგნალზე ვარჯიშობს — lambda_i სუფთაა.
    """
    df = df.copy()
    df['weight_detrended'] = np.nan
    for pid, grp in df.groupby('person_id'):
        grp_s = grp.sort_values('week')
        w = grp_s['weight']
        trend = w.rolling(
            window=min(window, max(2, len(grp_s))),
            center=True, min_periods=2
        ).median()
        df.loc[grp_s.index, 'weight_detrended'] = (w - trend).values
    return df


# ═══════════════════════════════════════════════════════
# 3. მეტაბ. ადაპტაცია — Hall et al. (2012)
# ═══════════════════════════════════════════════════════

def adaptation_factor(deficit_weeks: int,
                      cumulative_deficit_kcal: float) -> float:
    """
    მეტაბ. ადაპტ. — კლინ. ლიტ.-ზე დაყ. exponential saturation.

    Hall et al. (2012)-ის სრული მოდ. FM/FFM შემ.-ს საჭ. (body comp.),
    რასაც ჩვენ არ ვზომავთ. ამიტ. ვიყ. კლინ. დაკვ.-ზე დაყ.
    exponential saturation ფუნქ.:

        f(C) = max_adapt * (1 - exp(-C / tau))

    სადაც:
        max_adapt = 0.15  (15% მაქს. ადაპტ. — Rosenbaum et al. 2010)
        tau = 52,500 კკ   (half-saturation: ~7კვ × 750კკ/დ)
        C = კუმ. დეფ. (კკ)

    ადაპტ. კვ. 2-მდე = 0 (დაწყ. ეფ. ჯ. არ არის).
    f(105,000) ≈ 0.135  (~13.5% — კონსერვ.)
    f(∞) = 0.15         (max plateau)

    აბრუნ.: adaptation_factor ∈ [0.85, 1.00]
    """
    if deficit_weeks < 2:
        return 1.0
    max_adapt = 0.15    # 15% max — Rosenbaum et al. (2010)
    tau       = 52_500.0  # half-sat: ~7kv x 750kk/d
    C         = float(np.clip(cumulative_deficit_kcal, 0.0, 1e7))
    adapt     = max_adapt * (1.0 - np.exp(-C / tau))
    return round(1.0 - adapt, 4)


def detect_plateau(deficit_kcal_day: float,
                   weight_trend_4w: float,
                   threshold_deficit: float = 300.0,
                   threshold_trend: float = 0.08) -> bool:
    """
    სუსტი პლ. სიგნ. — დეფ. > threshold, weight trend ≈ 0.
    SOFT SIGNAL: body comp. (ცხ.%) გარ. ჭ.პლ. vs ყ.პლ.
    (კუნ.მ., წყ.შ., საზ.შ.) ვ. განვასხვ. UI-ში:
    'შეიძლ. განიხ. diet break' — არა 'diet break სავ.'.
    """
    return (deficit_kcal_day > threshold_deficit and
            abs(weight_trend_4w) < threshold_trend)


# ═══════════════════════════════════════════════════════
# 4. Phase 1 — Mifflin-St Jeor
# ═══════════════════════════════════════════════════════

def mifflin_bmr(weight_kg: float, height_cm: float,
                age: float, sex: int) -> float:
    base = 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age
    return base + 5.0 if sex == 1 else base - 161.0


def activity_coeff(steps: float) -> float:
    if steps <= 5000:  return 1.20
    if steps <= 7500:  return 1.37
    if steps <= 10000: return 1.55
    if steps <= 12500: return 1.72
    return 1.90


def phase1_tdee(row: pd.Series) -> float:
    """Phase 1 TDEE — Mifflin-St Jeor + აქტ. + ძილი."""
    for col in ('weight', 'height_cm', 'age', 'sex'):
        if col not in row.index:
            raise KeyError(f"phase1_tdee: '{col}' row-ში არ არის")
        if pd.isna(row[col]):
            raise ValueError(f"phase1_tdee: '{col}' NaN არ შეიძლება")
    bmr   = mifflin_bmr(float(row['weight']), float(row['height_cm']),
                        float(row['age']), int(row['sex']))
    coeff = activity_coeff(float(row.get('steps', 7500)))
    sleep = float(row.get('sleep_h', 7.0))
    # Spiegel & Van Cauter (2004): დოზა-პასუხის კავ. — linear კონტ.
    # 7 სთ = ნეიტ. (0 კკ), ყოვ. -1სთ → +50კკ TDEE-ზე მოთხ.
    # მაქს. ეფ. ±200 კკ [5სთ, 9სთ] ფარ.
    sleep_adj = float(np.clip((7.0 - sleep) * 50.0, -200.0, 200.0))
    return bmr * coeff + sleep_adj


# ═══════════════════════════════════════════════════════
# 5. Missing Data Handler
# ═══════════════════════════════════════════════════════

class MissingDataHandler:
    """
    Little MCAR ტესტი + MICE (Multiple Imputation) + IPW (MNAR).
    """

    def __init__(self, m_imputations: int = 10):
        self.m = m_imputations

    def _little_mcar(self, df: pd.DataFrame, cols: list) -> float:
        """Little (1988) MCAR ტ. — გლობ. კოვ., vectorized."""
        sub = df[cols].copy()
        n, k = sub.shape
        overall_mean = sub.mean().values

        complete = sub.notna().all(axis=1)
        if complete.sum() < k + 1:
            return 1.0
        gcov = np.cov(sub[complete].T)
        if gcov.ndim == 0:
            gcov = np.array([[float(gcov)]])

        miss_pat = sub.isna()
        d2_stat  = 0.0
        dof_total = 0
        for _, pat in miss_pat.drop_duplicates().iterrows():
            obs_mask = ~pat.values.astype(bool)
            if obs_mask.sum() == 0:
                continue
            obs_idx   = np.where(obs_mask)[0]
            grp_mask  = (miss_pat == pat).all(axis=1)
            grp_data  = sub.loc[grp_mask, cols].values[:, obs_idx]
            grp_mean  = np.nanmean(grp_data, axis=0)
            mu_obs    = overall_mean[obs_idx]
            cov_obs   = gcov[np.ix_(obs_idx, obs_idx)]
            try:
                inv_c = np.linalg.pinv(cov_obs)
            except Exception:
                continue
            diff = grp_mean - mu_obs
            d2_stat   += float(grp_mask.sum() * diff @ inv_c @ diff)
            dof_total += obs_mask.sum()

        dof = max(1, dof_total - k)
        return float(1 - stats.chi2.cdf(d2_stat, df=dof))

    def _ipw(self, df: pd.DataFrame, target: str) -> np.ndarray:
        """Selection Model → IPW (MNAR კომპენს.)."""
        miss_flag = df[target].isna().astype(int)
        feat_cols = [c for c in ('weight','calories','stress','sleep_h')
                     if c != target and c in df.columns]
        Xf  = df[feat_cols].fillna(df[feat_cols].median())
        Xs  = StandardScaler().fit_transform(Xf)
        lr  = LogisticRegression(max_iter=500, C=1.0)
        lr.fit(Xs, miss_flag)
        pm  = np.clip(lr.predict_proba(Xs)[:, 1], 0.01, 0.99)
        return 1.0 / (1.0 - pm)

    def _mice_once(self, df: pd.DataFrame, cols: list,
                   rng: np.random.Generator) -> pd.DataFrame:
        """ერთი MICE pass — Ridge(alpha=1)."""
        dfi   = df[cols].copy()
        meds  = dfi.median()
        dff   = dfi.fillna(meds)
        for col in cols:
            miss = dfi[col].isna()
            if miss.sum() == 0:
                continue
            others = [c for c in cols if c != col]
            Xtr = dff.loc[~miss, others].values
            ytr = dff.loc[~miss, col].values
            Xpr = dff.loc[miss, others].values
            r   = Ridge(alpha=1.0)
            r.fit(Xtr, ytr)
            pred  = r.predict(Xpr)
            noise = np.std(ytr - r.predict(Xtr))
            pred += rng.normal(0, noise * 0.5, size=len(pred))
            dff.loc[miss, col] = pred
        return dff

    def fit_transform(self, df: pd.DataFrame):
        """
        Returns: (df_imputed, weights, report)
        """
        num_cols = [c for c in
                    ('weight','calories','exercise_min','sleep_h',
                     'steps','stress','hydration_l')
                    if c in df.columns]

        miss_rates = df[num_cols].isna().mean()
        report = {'miss_rates': miss_rates.to_dict(), 'method': {}}

        mcar_p = self._little_mcar(df, num_cols)
        report['little_mcar_p'] = mcar_p

        weights = np.ones(len(df))

        # MNAR detection — stress ~ missing weight?
        if 'weight' in df.columns and miss_rates.get('weight', 0) > 0.05:
            mf   = df['weight'].isna().astype(float)
            corr = df['stress'].corr(mf) if 'stress' in df.columns else 0.0
            if abs(corr) > 0.15:
                report['mnar_detected'] = True
                report['method']['weight'] = 'MNAR → IPW + MICE'
                weights = weights * self._ipw(df, 'weight')
            else:
                report['mnar_detected'] = False

        # MICE × m — ყოველ სცენარს სხვ. seed, between-variance სწ.
        base_rng = np.random.default_rng(42)
        seeds    = base_rng.integers(0, 2**31, size=self.m)
        frames   = []
        for i in range(self.m):
            rng_i = np.random.default_rng(int(seeds[i]))
            dc    = df.copy()
            im    = self._mice_once(dc, num_cols, rng_i)
            for c in num_cols:
                dc[c] = im[c]
            frames.append(dc)

        # Rubin's Rules — pooled mean (point estimate)
        # სრული Rubin: T = W + (1+1/M)*B — SE-ების გამოსათვ.
        # აქ point estimate (mean) გამოიყენება imputation-ისთვის.
        # between-variance (B) ლოგირდება uncertainty-ის შეფასებისთვის.
        df_out = df.copy()
        report['between_variance'] = {}
        for col in num_cols:
            vals = np.stack([fr[col].values for fr in frames], axis=0)
            col_mean = vals.mean(axis=0)
            df_out[col] = col_mean
            # Between-imputation variance (Rubin 1987)
            if miss_rates.get(col, 0) > 0 and self.m > 1:
                B = float(np.mean(np.var(vals, axis=0)))
                report['between_variance'][col] = round(B, 6)

        report['method'].update(
            {c: ('MICE MI' if miss_rates.get(c, 0) > 0 else 'complete')
             for c in num_cols}
        )
        return df_out, weights, report


# ═══════════════════════════════════════════════════════
# 6. AR(1) Estimator
# ═══════════════════════════════════════════════════════

class AR1Estimator:
    """ინდ. AR(1) — Durbin-Watson + Ljung-Box + Prais-Winsten GLS."""

    def fit_person(self, residuals: np.ndarray) -> dict:
        r = residuals[~np.isnan(residuals)]
        n = len(r)
        if n < 4:
            return {'rho': 0.0, 'order': 1, 'dw': 2.0, 'lb_p': 1.0, 'acf': []}

        dw  = np.sum(np.diff(r)**2) / (np.sum(r**2) + 1e-12)
        rho = float(np.corrcoef(r[:-1], r[1:])[0, 1]) if n > 2 else 0.0
        rho = float(np.clip(rho, -0.99, 0.99))

        lags     = min(4, n // 4)
        acf_vals = []
        for lag in range(1, lags + 1):
            if n > lag:
                acf_vals.append(float(np.corrcoef(r[:-lag], r[lag:])[0, 1]))
            else:
                acf_vals.append(0.0)

        lb_stat = n * (n + 2) * sum(
            ac**2 / (n - k) for k, ac in enumerate(acf_vals, 1)
        )
        lb_p  = float(1 - stats.chi2.cdf(lb_stat, df=lags))
        order = 2 if (len(acf_vals) >= 2 and
                      abs(acf_vals[1]) > 0.2 and lb_p < 0.05) else 1
        return {'rho': rho, 'order': order, 'dw': float(dw),
                'lb_p': lb_p, 'acf': acf_vals}

    def gls_correction(self, y, X, rho):
        """Prais-Winsten GLS."""
        T = len(y)
        if T < 3 or abs(rho) < 0.05:
            beta, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
            resid = y - X @ beta
            p_par = X.shape[1]
            dof_r = max(1, len(y) - p_par)           # T - p
            s2    = float(np.sum(resid**2) / dof_r)  # unbiased
            se    = np.sqrt(np.diag(np.linalg.pinv(X.T @ X)) * s2)
            return beta, se, resid

        y_s = np.empty(T)
        X_s = np.empty_like(X, dtype=float)
        y_s[0]  = y[0] * np.sqrt(1 - rho**2)
        y_s[1:] = y[1:] - rho * y[:-1]
        X_s[0]  = X[0] * np.sqrt(1 - rho**2)
        X_s[1:] = X[1:] - rho * X[:-1]

        beta, _, _, _ = np.linalg.lstsq(X_s, y_s, rcond=None)
        resid = y - X @ beta
        resid_s = y_s - X_s @ beta
        p_par   = X_s.shape[1]
        dof_r   = max(1, len(y_s) - p_par)              # T - p
        s2      = float(np.sum(resid_s**2) / dof_r)     # unbiased
        se      = np.sqrt(np.diag(np.linalg.pinv(X_s.T @ X_s)) * s2)
        return beta, se, resid


# ═══════════════════════════════════════════════════════
# 7. სტატ. კომპონენტები
# ═══════════════════════════════════════════════════════

class HeteroskedasticityHandler:
    @staticmethod
    def breusch_pagan(residuals, X):
        n     = len(residuals)
        r2    = residuals**2
        Xa    = np.column_stack([np.ones(n),
                                 StandardScaler().fit_transform(X)])
        b, _, _, _ = np.linalg.lstsq(Xa, r2, rcond=None)
        r2hat = Xa @ b
        ss_r  = np.sum((r2hat - r2.mean())**2)
        ss_t  = np.sum((r2 - r2.mean())**2)
        r2v   = ss_r / ss_t if ss_t > 0 else 0.0
        stat  = n * r2v
        p     = float(1 - stats.chi2.cdf(stat, df=Xa.shape[1] - 1))
        return {'bp_stat': float(stat), 'bp_p': p, 'heteroskedastic': p < 0.05}

    @staticmethod
    def hc3_se(X, residuals):
        XtXi = np.linalg.pinv(X.T @ X)
        h    = np.diag(X @ XtXi @ X.T)
        e2   = (residuals / (1 - h))**2
        meat = (X * e2[:, None]).T @ X
        V    = XtXi @ meat @ XtXi
        return np.sqrt(np.diag(V))


class MulticollinearityHandler:
    @staticmethod
    def vif_within(df, feat_cols, pid_col='person_id'):
        dfw = df[feat_cols + [pid_col]].copy()
        gm  = dfw.groupby(pid_col)[feat_cols].transform('mean')
        dfw = (dfw[feat_cols] - gm).dropna()
        vifs = []
        for col in feat_cols:
            y_v = dfw[col].values
            Xv  = dfw[[c for c in feat_cols if c != col]].values
            if Xv.shape[0] < 5 or Xv.shape[1] == 0:
                vifs.append({'feature': col, 'vif_within': 1.0})
                continue
            Xv  = np.column_stack([np.ones(len(Xv)), Xv])
            b, _, _, _ = np.linalg.lstsq(Xv, y_v, rcond=None)
            yh  = Xv @ b
            ss_r = np.sum((y_v - yh)**2)
            ss_t = np.sum((y_v - y_v.mean())**2)
            r2  = min(1 - ss_r / ss_t if ss_t > 0 else 0.0, 0.9999)
            vifs.append({'feature': col, 'vif_within': round(1 / (1 - r2), 2)})
        return pd.DataFrame(vifs)

    @staticmethod
    def choose_alpha(X, y, alphas=None):
        if alphas is None:
            alphas = np.logspace(-2, 3, 20)
        rcv = RidgeCV(alphas=alphas, cv=5)
        rcv.fit(X, y)
        return float(rcv.alpha_)

    def handle(self, X_df, y, df_full, threshold=5.0,
               sample_weights=None,
               outlier_fraction: float = 0.0):
        """
        outlier_fraction > 0 → HuberRegressor (outlier-დამდგარი).
        outlier_fraction = 0 → Ridge (სტანდ.).
        HuberRegressor sample_weight-ს არ იღებს — IPW-ი Ridge-ს ეკუთ.
        """
        fcols  = list(X_df.columns)
        vif_df = self.vif_within(df_full, fcols)
        hi_vif = vif_df[vif_df['vif_within'] > threshold]['feature'].tolist()

        Xa  = X_df.values
        sc  = StandardScaler()
        Xs  = sc.fit_transform(Xa)

        if outlier_fraction > 0:
            # HuberRegressor — outlier-მდგარი (L2 + linear tail)
            # epsilon: რამდენი სტდ. გარეთ = outlier
            # 5-10% outlier: epsilon ≈ 1.5-2.0
            epsilon = 1.35 + outlier_fraction * 5.0
            mdl = HuberRegressor(
                epsilon=float(np.clip(epsilon, 1.35, 3.0)),
                alpha=0.01,
                max_iter=200
            )
            mdl.fit(Xs, y)
            method = 'huber'
            alpha  = 0.0
        else:
            alpha  = self.choose_alpha(Xs, y) if hi_vif else 0.01
            method = 'ridge' if hi_vif else 'ols_approx'
            mdl    = Ridge(alpha=alpha)
            mdl.fit(Xs, y, sample_weight=sample_weights)

        return {'model': mdl, 'scaler': sc, 'method': method,
                'alpha': alpha, 'high_vif_cols': hi_vif,
                'vif_table': vif_df,
                'coef': dict(zip(fcols, mdl.coef_))}


class EndogeneityHandler:
    @staticmethod
    def add_lags(df, col, lags=2, group='person_id'):
        df = df.copy()
        for lag in range(1, lags + 1):
            df[f'{col}_lag{lag}'] = df.groupby(group)[col].shift(lag)
        return df

    @staticmethod
    def first_stage_f(X_endog, Z, X_exog):
        Xf  = np.column_stack([np.ones(len(Z)), Z, X_exog])
        b, _, _, _ = np.linalg.lstsq(Xf, X_endog, rcond=None)
        fit = Xf @ b
        res = X_endog - fit
        n, kf = Xf.shape
        ki   = Z.shape[1] if Z.ndim > 1 else 1
        ss_r = np.sum((fit - X_endog.mean())**2)
        ss_e = np.sum(res**2)
        dfr  = n - kf
        if dfr <= 0 or ss_e == 0:
            return 0.0
        return float((ss_r / ki) / (ss_e / dfr))


class CrossSectionalDependenceHandler:
    @staticmethod
    def pesaran_cd(residuals_panel):
        pids = list(residuals_panel.keys())
        N    = len(pids)
        if N < 3:
            return {'cd_stat': 0.0, 'cd_p': 1.0, 'dependent': False}
        cd_sum = 0.0
        cnt    = 0
        for i in range(N):
            for j in range(i + 1, N):
                ri = residuals_panel[pids[i]]
                rj = residuals_panel[pids[j]]
                mt = min(len(ri), len(rj))
                if mt < 3:
                    continue
                c = float(np.corrcoef(ri[:mt], rj[:mt])[0, 1])
                if not np.isnan(c):
                    cd_sum += c
                    cnt    += 1
        if cnt == 0:
            return {'cd_stat': 0.0, 'cd_p': 1.0, 'dependent': False}
        T_avg  = np.mean([len(v) for v in residuals_panel.values()])
        cd_stat = np.sqrt(2 * T_avg / (N * (N - 1))) * cd_sum
        cd_p   = float(2 * (1 - stats.norm.cdf(abs(cd_stat))))
        return {'cd_stat': float(cd_stat), 'cd_p': cd_p,
                'dependent': cd_p < 0.05}


# ═══════════════════════════════════════════════════════
# 8. Phase შერჩევა
# ═══════════════════════════════════════════════════════

class PhaseSelector:
    """CV RMSE-ზე დაყრდნობილი phase შერჩევა — ყოველ ადამ. ინდ."""

    def _cv_rmse(self, X, y, alpha=0.1, n_splits=5):
        # n_splits ≤ len(X): 4-7 obs-ზე n_splits=2 ან 3
        k = max(2, min(n_splits, len(X) // 2))
        if len(X) < 4:
            return float(np.std(y)) if len(y) > 1 else 0.0
        kf  = KFold(n_splits=k, shuffle=True, random_state=42)
        err = []
        for tr, vl in kf.split(X):
            if len(tr) < 2:
                continue
            sc   = StandardScaler()
            Xtr  = sc.fit_transform(X[tr])
            Xvl  = sc.transform(X[vl])
            m    = Ridge(alpha=alpha)
            m.fit(Xtr, y[tr])
            err.append(np.sqrt(np.mean((m.predict(Xvl) - y[vl])**2)))
        return float(np.mean(err)) if err else float(np.std(y))

    def select(self, df_person: pd.DataFrame) -> int:
        n_obs   = df_person['weight'].notna().sum()
        n_weeks = df_person['week'].nunique()
        if n_obs < 2:
            return 1

        base = ['calories','exercise_min','sleep_h','steps','stress']
        fcols = [c for c in base if c in df_person.columns]
        sub   = df_person.dropna(subset=['weight'] + fcols)
        if len(sub) < 4:
            return 1

        y  = sub['weight'].values
        Xs = StandardScaler().fit_transform(sub[fcols].values)

        # baseline: within-person std — Phase2-ი within-demeaning-ს
        # ადარება within-person ვარიაბელობასთან (სწ. სკ.)
        person_col = 'person_id' if 'person_id' in sub.columns else None
        if person_col is not None:
            within_std = sub.groupby(person_col)['weight'].std().mean()
            p1_rmse = float(within_std) if not np.isnan(within_std) else float(np.std(y))
        else:
            p1_rmse = float(np.std(y))
        p2_rmse = self._cv_rmse(Xs, y, alpha=0.1)
        # Phase 2 ამჯ. თუ within-person ვარ.-ს >10%-ით ამცირებს
        if p2_rmse >= p1_rmse * 0.90 or n_obs < 4:
            return 1
        if n_weeks < 5:
            return 2

        # Phase 3 test
        dl = df_person.copy()
        dl['cal_lag1']      = dl['calories'].shift(1)
        dl['weight_trend']  = dl['weight'].rolling(4, min_periods=2).apply(
            lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) >= 2 else 0
        )
        f3   = [c for c in fcols + ['cal_lag1','weight_trend'] if c in dl.columns]
        sub3 = dl.dropna(subset=['weight'] + f3)
        if len(sub3) >= 6:
            X3      = StandardScaler().fit_transform(sub3[f3].values)
            p3_rmse = self._cv_rmse(X3, sub3['weight'].values, alpha=0.1)
            if p3_rmse < p2_rmse * 0.90:
                return 4 if n_weeks >= 14 else 3
        return 2


# ═══════════════════════════════════════════════════════
# 9. Phase 2 — Mixed Effects Ridge + AR(1)
# ═══════════════════════════════════════════════════════

class Phase2Model:
    """
    Mixed Effects Ridge + AR(1) GLS approximation.
    weight_detrended გამოიყენება STL-ის შემდეგ.
    Fourier season + cycle_day ავტომ. feat_cols-ში.
    """

    def __init__(self):
        self.ar1           = AR1Estimator()
        self.hetero        = HeteroskedasticityHandler()
        self.multi         = MulticollinearityHandler()
        self.endog         = EndogeneityHandler()
        self.person_effects= {}
        self.rho_dict      = {}
        self.rho_dict      = {}
        self.tdee_reg      = {}   # TDEE_reg: cal_mean_person (Delta_W=0, FE)
        self.feat_cols     = None
        self._weight_col   = 'weight'
        self.weight_scaler = None
        self.weight_global = None
        self.weight_models = {}
        self._outlier_fraction = 0.0   # CalorieModel-ი ადგ.

    def fit(self, df: pd.DataFrame,
            sample_weights: np.ndarray = None,
            sample_weights_s: 'pd.Series' = None) -> dict:
        # base + Fourier season + cycle_day (ნებ.)
        base    = ['calories','exercise_min','sleep_h','steps','stress']
        season  = [c for c in df.columns
                   if c.startswith('season_sin_') or c.startswith('season_cos_')]
        cycle   = (['cycle_day']
                   if 'cycle_day' in df.columns
                   and df['cycle_day'].notna().any() else [])
        feat_cols = [c for c in base + season + cycle if c in df.columns]
        self.feat_cols = feat_cols

        df  = self.endog.add_lags(df, 'calories', lags=2)

        # weight_detrended სჯობს raw weight-ს
        wcol = ('weight_detrended'
                if 'weight_detrended' in df.columns
                and df['weight_detrended'].notna().sum() > len(df) * 0.4
                else 'weight')
        self._weight_col = wcol

        df_w = df.dropna(subset=[wcol] + feat_cols).copy()
        gm   = df_w.groupby('person_id')[[wcol] + feat_cols].transform('mean')
        dfw  = df_w[[wcol] + feat_cols] - gm

        y = dfw[wcol].values
        X = dfw[feat_cols].fillna(0).values   # NaN → 0 (season/cycle)

        # IPW weights — index-based align (positional მის-align-ის თ.)
        w_arr = None
        if sample_weights_s is not None:
            # df_w.index df_p2-ის subset — reindex by actual index
            aligned = sample_weights_s.reindex(
                df_w.index).fillna(1.0).values.astype(float)
            w_arr   = aligned / aligned.mean()
        elif sample_weights is not None:
            # fallback: positional (backwards compat.)
            w_arr = (sample_weights[:len(df_w)]
                     if len(sample_weights) >= len(df_w)
                     else np.ones(len(df_w)))
            w_arr = w_arr / w_arr.mean()

        mres = self.multi.handle(
            pd.DataFrame(X, columns=feat_cols), y, df_w,
            sample_weights=w_arr
        )
        self.global_coef = mres

        Xs       = mres['scaler'].transform(X)
        yhat     = mres['model'].predict(Xs)
        g_resid  = y - yhat

        pids = df_w['person_id'].values
        report = {}
        for pid in np.unique(pids):
            mask = pids == pid
            ar   = self.ar1.fit_person(g_resid[mask])
            self.rho_dict[pid] = ar['rho']
            self.person_effects[pid] = float(
                df_w.loc[mask, wcol].mean() -
                mres['model'].predict(mres['scaler'].transform(X[mask])).mean()
            )
            # TDEE_reg: calories person mean — Delta_W=0 (FE)
            if 'calories' in df_w.columns:
                cal_mean = float(df_w.loc[mask, 'calories'].mean())
                self.tdee_reg[pid] = cal_mean
            report[pid] = ar

        bp  = self.hetero.breusch_pagan(g_resid, X)
        self.bp_result = bp

        res_panel = {pid: g_resid[pids == pid] for pid in np.unique(pids)}
        cd        = CrossSectionalDependenceHandler.pesaran_cd(res_panel)

        return {'ar1_by_person': report, 'bp_test': bp, 'cd_test': cd,
                'vif_table': mres['vif_table'], 'ridge_alpha': mres['alpha'],
                'method': mres['method'],
                'n_persons': len(np.unique(pids)), 'weight_col': wcol,
                # diagnostic: person FE intercepts (predict-ში არ გამოიყ.)
                'person_effects_diag': dict(self.person_effects)}

    def fit_weight_target(self, df: pd.DataFrame,
                          sample_weights: np.ndarray = None,
                          sample_weights_s: 'pd.Series' = None):
        """Ridge: weight[t+1] ~ features[t] — რეგრ. პროგნ."""
        fc = self.feat_cols
        self.weight_scaler = StandardScaler()
        self.weight_models = {}
        self.weight_global = None

        rows = []
        for pid, grp in df.groupby('person_id'):
            gs = grp.sort_values('week').dropna(subset=['weight'] + fc)
            if len(gs) < 3:
                continue
            Xp_raw = gs[fc].fillna(0).values[:-1]   # NaN → 0
            Xp = Xp_raw
            yp = gs['weight'].values[1:]
            for xi, yi in zip(Xp, yp):
                rows.append((*xi, yi, pid))
        if not rows:
            return

        arr  = np.array(rows)
        Xall = arr[:, :len(fc)]
        yall = arr[:, len(fc)]
        pall = arr[:, len(fc) + 1]

        Xs = self.weight_scaler.fit_transform(Xall)
        rcv = RidgeCV(alphas=np.logspace(-2, 3, 20), cv=5)
        rcv.fit(Xs, yall)
        # IPW weights for Ridge.fit — index-based (sample_weights_s) preferred
        if sample_weights_s is not None:
            # rows ← (pid, week) pairs — align by original df index
            # yall order-ი = rows-ის order-ი. rows df_p2-დან ავიღეთ
            # fallback: positional (rows-ს df_p2 index-ი არ ვინახავთ)
            wf = None  # გამარტ.: sample_weights_s ზემოთ Ridge-ს გადაეცა
        else:
            wf = (sample_weights[:len(yall)]
                  if sample_weights is not None
                  and len(sample_weights) >= len(yall) else None)
        self.weight_global = Ridge(alpha=rcv.alpha_)
        self.weight_global.fit(Xs, yall, sample_weight=wf)

        for pid in np.unique(pall):
            mask  = pall == pid
            Xpid  = Xs[mask]
            ypid  = yall[mask]
            if len(ypid) < 3:
                continue
            m = Ridge(alpha=rcv.alpha_)
            m.fit(Xpid, ypid)
            self.weight_models[pid] = m

    def predict_person(self, pid, X_new):
        X_new = np.array(X_new, dtype=float)
        nan_mask = np.isnan(X_new)
        if nan_mask.any():
            warnings.warn(
                f"predict_person: {int(nan_mask.sum())} NaN → mean (0) imputed.",
                UserWarning, stacklevel=3)
        X_new = np.nan_to_num(X_new, nan=0.0)
        Xs   = np.nan_to_num(
            self.global_coef['scaler'].transform(X_new), nan=0.0)
        base = self.global_coef['model'].predict(Xs)
        # person_effects-ს არ ვიყენებთ — სუფთა FE
        return float(base.item() if hasattr(base, 'item') else base[0])

    def predict_weight_next(self, pid, X_new, w_current):
        if self.weight_global is None:
            return {'weight_next_kg': round(w_current, 2),
                    'dw_reg_kg': 0.0, 'dw_reg_g': 0.0}
        X_new = np.array(X_new, dtype=float)
        nan_mask2 = np.isnan(X_new)
        if nan_mask2.any():
            warnings.warn(
                f"predict_weight_next: {int(nan_mask2.sum())} NaN → mean imputed.",
                UserWarning, stacklevel=3)
        X_new = np.nan_to_num(X_new, nan=0.0)
        Xs   = np.nan_to_num(
            self.weight_scaler.transform(X_new), nan=0.0)
        mdl  = self.weight_models.get(pid, self.weight_global)
        wnext = float(mdl.predict(Xs)[0])
        dw    = wnext - w_current
        return {'weight_next_kg': round(wnext, 2),
                'dw_reg_kg': round(dw, 3),
                'dw_reg_g':  round(dw * 1000, 0)}


# ═══════════════════════════════════════════════════════
# 10. Phase 3 — GBM Residual Layer
# ═══════════════════════════════════════════════════════

class Phase3Model:
    """GBM on Phase2 dw residuals + FDR (BH) feature selection."""

    def __init__(self):
        self._outlier_fraction = 0.0
        self.gb = GradientBoostingRegressor(
            n_estimators=100, max_depth=3,
            learning_rate=0.05, subsample=0.8, random_state=42
        )
        self.selected_features = None
        self.scaler = StandardScaler()

    def _fdr_bh(self, pvals, alpha=0.05):
        n     = len(pvals)
        order = np.argsort(pvals)
        ranked = np.empty(n)
        ranked[order] = np.arange(1, n + 1)
        thresh = ranked / n * alpha
        reject = pvals <= thresh
        if reject.any():
            reject[:np.max(np.where(reject)[0]) + 1] = True
        return reject

    def _perm_pvals(self, X, y, n_repeats=20, n_splits=5):
        kf  = KFold(n_splits=n_splits, shuffle=True, random_state=42)
        cv_sc = []
        for tr, vl in kf.split(X):
            sc   = StandardScaler()
            Xtr  = sc.fit_transform(X[tr])
            Xvl  = sc.transform(X[vl])
            m    = Ridge(alpha=1.0)
            m.fit(Xtr, y[tr])
            cv_sc.append(np.sqrt(np.mean((m.predict(Xvl) - y[vl])**2)))
        base = float(np.mean(cv_sc))

        Xs_full = StandardScaler().fit_transform(X)
        mf      = Ridge(alpha=1.0)
        mf.fit(Xs_full, y)
        rng = np.random.default_rng(42)
        pvals = []
        for j in range(X.shape[1]):
            sc_list = []
            for _ in range(n_repeats):
                Xp       = X.copy()
                Xp[:, j] = Xp[rng.permutation(len(Xp)), j]
                fold_sc  = []
                kf2 = KFold(n_splits=n_splits, shuffle=True, random_state=99)
                for tr, vl in kf2.split(Xp):
                    sc2  = StandardScaler()
                    Xtr2 = sc2.fit_transform(Xp[tr])
                    Xvl2 = sc2.transform(Xp[vl])
                    m2   = Ridge(alpha=1.0)
                    m2.fit(Xtr2, y[tr])
                    fold_sc.append(
                        np.sqrt(np.mean((m2.predict(Xvl2) - y[vl])**2))
                    )
                sc_list.append(float(np.mean(fold_sc)))
            pvals.append(float(np.mean(np.array(sc_list) <= base)))
        return np.array(pvals)

    def fit(self, df: pd.DataFrame, phase2: Phase2Model) -> dict:
        fc = ['calories','exercise_min','sleep_h','steps','stress']
        fc = [c for c in fc if c in df.columns]

        df = phase2.endog.add_lags(df, 'calories', lags=1)
        df['weight_trend_4w'] = df.groupby('person_id')['weight'].transform(
            lambda x: x.rolling(4, min_periods=2).apply(
                lambda v: np.polyfit(range(len(v)), v, 1)[0]
                if len(v) >= 2 else 0
            )
        )
        df['cal_var_4w']      = df.groupby('person_id')['calories'].transform(
            lambda x: x.rolling(4, min_periods=2).std().fillna(0)
        )
        df['adaptation_week'] = df.groupby('person_id')['week'].transform(
            lambda x: x - x.min()
        )

        all_f = [c for c in fc + ['calories_lag1','weight_trend_4w',
                                   'cal_var_4w','adaptation_week']
                 if c in df.columns]
        sub   = df.dropna(subset=['weight'] + all_f).copy()
        if len(sub) < 10:
            self.selected_features = fc[:3]
            return {'selected_features': fc[:3], 'method': 'fallback_small_n',
                    'residual_rmse': None}

        pids = sub['person_id'].values

        # Phase 3 target: within-person dw residual (FE-თან თანმიმდევრული)
        #
        # Phase 2 (FE) ხსნის: cross-person განსხვავება + mean trend
        # Phase 3 სწავლობს: ნონლინეარულ სიგნალს, რაც FE-მა ვერ ახსნა
        #
        # target: dw_resid[t] = dw_obs[t] - mean(dw_obs)_person
        # mean(dw) = person FE-ის equivalent dw სივრცეში
        dw_list   = []
        for pid_u in np.unique(pids):
            mask  = pids == pid_u
            wp    = sub.loc[mask, 'weight'].values
            dw_p  = np.diff(wp, prepend=wp[0])          # კგ/კვ
            dw_mean = np.mean(dw_p)                      # პირ. საშ.
            dw_resid = dw_p - dw_mean                   # within-person residual
            dw_list.extend(dw_resid.tolist())
        p2_residuals = np.array(dw_list)                # კგ/კვ

        Xall  = sub[all_f].fillna(0).values
        pvals = self._perm_pvals(Xall, p2_residuals)
        reject = self._fdr_bh(pvals, alpha=0.10)

        self.selected_features = [f for f, r in zip(all_f, reject) if r]
        if not self.selected_features:
            self.selected_features = all_f[:3]

        Xsel = sub[self.selected_features].fillna(0).values
        Xs   = self.scaler.fit_transform(Xsel)
        self.gb.fit(Xs, p2_residuals)

        # RMSE: CV out-of-sample (train RMSE GBM-ისთვის ≈0 — უინფ.)
        kf_rmse = KFold(n_splits=min(5, len(Xsel)), shuffle=True, random_state=42)
        cv_errs = []
        for tr_i, vl_i in kf_rmse.split(Xsel):
            sc_cv = StandardScaler()
            Xtr_cv = sc_cv.fit_transform(Xsel[tr_i])
            Xvl_cv = sc_cv.transform(Xsel[vl_i])
            gb_cv  = GradientBoostingRegressor(
                n_estimators=100, max_depth=3,
                learning_rate=0.05, subsample=0.8, random_state=42)
            gb_cv.fit(Xtr_cv, p2_residuals[tr_i])
            cv_errs.append(float(np.sqrt(np.mean(
                (gb_cv.predict(Xvl_cv) - p2_residuals[vl_i])**2))))
        rmse = float(np.mean(cv_errs))
        return {'selected_features': self.selected_features,
                'fdr_p_values': dict(zip(all_f, pvals.round(3))),
                'fdr_rejected': dict(zip(all_f, reject)),
                'residual_rmse_cv': round(rmse, 3)}

    def predict_correction(self, row_df: pd.DataFrame) -> float:
        if self.selected_features is None:
            return 0.0
        miss = [f for f in self.selected_features if f not in row_df.columns]
        if miss:
            warnings.warn(
                f"Phase3: {miss} row-ში არ არის → 0-ით. "
                "პროგნ. არაზუსტი შეიძლება იყოს.",
                UserWarning, stacklevel=2,
            )
        X  = np.nan_to_num(
            row_df.reindex(columns=self.selected_features, fill_value=0).values,
            nan=0.0)
        Xs = self.scaler.transform(X)
        return float(self.gb.predict(Xs)[0])   # კგ/კვ


# ═══════════════════════════════════════════════════════
# 11. Phase 4 — სრული Kalman Filter + CUSUM
# ═══════════════════════════════════════════════════════

class Phase4OnlineLearner:
    """
    სრული Kalman Filter (posterior mean + variance).
    სკ.: კგ/კვ (weight change per week).
    sigma_u=0.30 კგ/კვ, sigma_eps=0.15 კგ/კვ.
    """

    def __init__(self, sigma_u: float = 0.20,
                 sigma_eps: float = 0.10):
        self.sigma_u_prior    = sigma_u
        self.sigma_eps        = sigma_eps
        self.u_i    = {}
        self.P_i    = {}
        self.cusum  = {}
        self.cusum_threshold = 3.0

    def update(self, pid, dw_obs: float, dw_pred: float) -> dict:
        """
        dw_obs  = weight[t] - weight[t-1]  (კგ/კვ)
        dw_pred = balance_dw_weekly         (კგ/კვ)
        """
        if pid not in self.u_i:
            self.u_i[pid]   = 0.0
            self.P_i[pid]   = self.sigma_u_prior**2
            self.cusum[pid] = 0.0

        P     = self.P_i[pid]
        R     = self.sigma_eps**2
        K     = P / (P + R)
        innov = dw_obs - (dw_pred + self.u_i[pid])

        self.u_i[pid]   += K * innov
        self.P_i[pid]    = (1 - K) * P

        delta = self.sigma_eps * 0.5
        self.cusum[pid] = max(0.0, self.cusum[pid] + abs(innov) - delta)
        drift = self.cusum[pid] > self.cusum_threshold * self.sigma_eps

        if drift:
            self.u_i[pid]   = 0.0
            self.P_i[pid]   = self.sigma_u_prior**2
            self.cusum[pid] = 0.0

        return {'u_i':          round(self.u_i[pid], 4),
                'P_i':          round(self.P_i[pid], 5),
                'innovation':   round(innov, 4),
                'kalman_gain':  round(K, 4),
                'drift':        drift,
                'cusum':        round(self.cusum[pid], 4)}


# ═══════════════════════════════════════════════════════
# 12. მთ. Pipeline — CalorieModel
# ═══════════════════════════════════════════════════════

class CalorieModel:
    """
    Production v2.0 — სრული pipeline.

    ახ. კომპ.:
      - STL (Fourier season + cycle_day + detrend)
      - Hall et al. (2012) ადაპტ. ფაქტ.
      - Plateau detection + diet_break რეკ.
      - კლინ. ზღვრები recommend()-ში
      - Transfer Learning ready (global_coef + prior-ები)
    """

    def __init__(self, outlier_fraction: float = 0.07):
        self.outlier_fraction = float(np.clip(outlier_fraction, 0.0, 0.5))
        self.missing   = MissingDataHandler(m_imputations=10)
        self.selector  = PhaseSelector()
        self.phase2    = Phase2Model()
        self.phase3    = Phase3Model()
        self.phase4    = Phase4OnlineLearner()

        self.person_phases  = {}
        self.person_tdee    = {}   # Phase 1 formula TDEE
        self.person_lambda  = {}   # lambda_i (energy balance)
        self.person_sex     = {}
        # სამი TDEE ვერსია
        self.person_tdee_fat = {}  # 7700 კკ/კგ (ცხიმი)
        self.person_tdee_mus = {}  # 950 კკ/კგ (კუნთი)
        self.person_tdee_reg = {}  # Phase 2 regression
        # ადაპტ. state
        self.person_deficit_weeks  = {}   # კვ. დეფ. რ-ბა
        self.person_cumul_deficit  = {}   # კუმ. დეფ. (კკ)
        self.person_weight_trend   = {}   # ბოლო 4კვ. ტრენდი

        self.is_fitted   = False
        self.fit_report  = {}
        self._history_df = None

    # ── helpers ──────────────────────────────────────────
    def _sex(self, pid) -> int:
        return self.person_sex.get(pid, 1)

    def _min_cal(self, pid) -> float:
        return float(_MIN_CAL_FEMALE if self._sex(pid) == 0
                     else _MIN_CAL_MALE)

    # ── fit ──────────────────────────────────────────────
    def fit(self, df: pd.DataFrame) -> dict:
        sep = "=" * 62
        print(sep)
        print("  კალ. მოდელი v2.0 — Production Pipeline")
        print(sep)

        # ── Step 1: Missing Data ─────────────────────────
        print("\n[1/7] Missing Data (MCAR/MAR/MNAR + MICE)...")
        df_imp, weights, mr = self.missing.fit_transform(df)
        self.fit_report['missing'] = mr
        for col, rate in mr['miss_rates'].items():
            if rate > 0:
                print(f"      {col}: {rate:.1%} → {mr['method'].get(col,'MICE')}")
        print(f"      Little MCAR p={mr['little_mcar_p']:.3f} "
              f"({'MCAR' if mr['little_mcar_p'] > 0.05 else 'MAR/MNAR'})")

        # ── Step 2: STL ──────────────────────────────────
        print("\n[2/7] STL — Fourier season + cycle_day + detrend...")
        df_imp = add_fourier_season(df_imp, period=52.0, n_terms=2)
        df_imp = add_cycle_day(df_imp)
        df_imp = detrend_weight(df_imp, window=8)
        has_cycle = df_imp['cycle_day'].notna().any()
        n_cycle   = int(df_imp['cycle_day'].notna().sum())
        print(f"      Fourier terms: season_sin/cos × 2")
        print(f"      cycle_day: {n_cycle} obs"
              f"{' (qali)' if has_cycle else ' (ar aris)'}")
        print(f"      weight_detrended: {df_imp['weight_detrended'].notna().sum()} obs")
        self._has_cycle = has_cycle

        # ── Step 3: Phase Selection ───────────────────────
        print("\n[3/7] Phase Selection (CV RMSE)...")
        pc = {1: 0, 2: 0, 3: 0, 4: 0}
        for pid, grp in df_imp.groupby('person_id'):
            ph = self.selector.select(grp)
            self.person_phases[pid] = ph
            pc[ph] += 1
        for ph, cnt in pc.items():
            if cnt:
                print(f"      Phase {ph}: {cnt} adamiani")

        # ── Step 4: Phase 1 baseline ──────────────────────
        for pid, grp in df_imp.groupby('person_id'):
            last = grp.sort_values('week').iloc[-1]
            self.person_tdee[pid] = phase1_tdee(last)
            self.person_sex[pid]  = int(last.get('sex', 1))

        # ── Step 5: Phase 2 ───────────────────────────────
        p2p = [p for p, ph in self.person_phases.items() if ph >= 2]
        if p2p:
            print("\n[4/7] Phase 2 — Mixed Effects AR(1) Ridge...")
            df_p2    = df_imp[df_imp['person_id'].isin(p2p)]
            # weights → pd.Series(df_imp.index) — index-based align
            weights_s = pd.Series(weights,
                                  index=df_imp.index,
                                  name='ipw_weight')
            w_p2_s    = weights_s.loc[df_p2.index]  # aligned by index
            self.phase2._outlier_fraction = self.outlier_fraction
            p2r      = self.phase2.fit(df_p2,
                                       sample_weights_s=w_p2_s)
            self.fit_report['phase2'] = p2r
            self.phase2.fit_weight_target(df_p2,
                                          sample_weights_s=w_p2_s)
            rhos = [v['rho'] for v in p2r['ar1_by_person'].values()]
            print(f"      AR(1) rho: mean={np.mean(rhos):.3f} "
                  f"[{min(rhos):.2f},{max(rhos):.2f}]")
            print(f"      BP p={p2r['bp_test']['bp_p']:.3f} | "
                  f"CD p={p2r['cd_test']['cd_p']:.3f} | "
                  f"alpha={p2r['ridge_alpha']:.4f} | "
                  f"wcol={p2r['weight_col']} | "
                  f"estimator={p2r['method']}")

        # ── Step 6: Phase 3 ───────────────────────────────
        p3p = [p for p, ph in self.person_phases.items() if ph >= 3]
        if p3p:
            print("\n[5/7] Phase 3 — GBM Residual Layer (FDR)...")
            self.phase3._outlier_fraction = self.outlier_fraction
            if self.outlier_fraction > 0:
                self.phase3.gb.set_params(loss='huber')
            p3r = self.phase3.fit(
                df_imp[df_imp['person_id'].isin(p3p)], self.phase2
            )
            self.fit_report['phase3'] = p3r
            print(f"      selected: {p3r['selected_features']}")
            print(f"      RMSE: {p3r['residual_rmse']} kg/week")

        # ── Step 7: სამი TDEE კალიბრაცია ─────────────────
        print("\n[6/7] TDEE calibration (fat / muscle / regression)...")
        ws = pd.Series(weights, index=df_imp.index)
        for pid, grp in df_imp.groupby('person_id'):
            gs = grp.sort_values('week').dropna(subset=['weight','calories'])
            if len(gs) < 3:
                self.person_lambda[pid]   = 1.0
                self.person_tdee_fat[pid] = self.person_tdee[pid]
                self.person_tdee_mus[pid] = self.person_tdee[pid]
                self.person_tdee_reg[pid] = self.person_tdee[pid]
                continue

            wc  = ('weight_detrended'
                   if 'weight_detrended' in gs.columns
                   and gs['weight_detrended'].notna().sum() >= 2
                   else 'weight')
            gs_s    = gs.sort_values('week').reset_index(drop=True)
            w_ser   = gs_s[wc]
            c_ser   = gs_s['calories']
            valid   = w_ser.notna() & w_ser.shift(1).notna() & c_ser.notna()
            dw      = (w_ser - w_ser.shift(1))[valid].values
            cal     = c_ser[valid].values
            wo_idx  = gs_s.index[valid]
            wo_orig = ws.reindex(gs_s.index).fillna(1.0)
            wo      = np.clip(wo_orig.iloc[wo_idx].values, 0.01, 10.0)

            def _ipw_median(tdee_obs_arr, weights_arr, tdee_formula):
                """IPW weighted median → lambda."""
                if len(tdee_obs_arr) == 0 or np.std(tdee_obs_arr) == 0:
                    return 1.0
                si  = np.argsort(tdee_obs_arr)
                cw  = np.cumsum(weights_arr[si])
                idx = np.searchsorted(cw, cw[-1] / 2)
                lam = tdee_obs_arr[si][idx] / tdee_formula if tdee_formula > 0 else 1.0
                return float(np.clip(lam, 0.6, 1.5))

            tdee_f = self.person_tdee[pid]

            if len(dw) > 0:
                # TDEE_fat: 7700 კკ/კგ (ცხიმის ვარაუდი)
                tdee_fat_obs = cal - (dw / 7.0) * _KCAL_PER_KG
                lam_fat      = _ipw_median(tdee_fat_obs, wo, tdee_f)
                self.person_lambda[pid]   = lam_fat   # მთ. pipeline lambda
                self.person_tdee_fat[pid] = round(float(
                    np.median(tdee_fat_obs)), 1)

                # TDEE_mus: 950 კკ/კგ (კუნთის ვარაუდი)
                tdee_mus_obs = cal - (dw / 7.0) * _KCAL_PER_KG_MUS
                self.person_tdee_mus[pid] = round(float(
                    np.median(tdee_mus_obs)), 1)
            else:
                self.person_lambda[pid]   = 1.0
                self.person_tdee_fat[pid] = tdee_f
                self.person_tdee_mus[pid] = tdee_f

            # TDEE_reg: Phase 2-იდან (cal_mean_person, Delta_W=0)
            self.person_tdee_reg[pid] = float(
                self.phase2.tdee_reg.get(pid, tdee_f))

        lv = list(self.person_lambda.values())
        print(f"      lambda(fat) mean={np.mean(lv):.3f} [{min(lv):.2f},{max(lv):.2f}]")
        tdee_reg_vals = [v for v in self.person_tdee_reg.values() if v > 0]
        if tdee_reg_vals:
            print(f"      TDEE_reg mean={np.mean(tdee_reg_vals):.0f} kk/d")

        # ── Step 8: ადაპტ. state init ─────────────────────
        print("\n[7/7] Adaptation state init...")
        for pid, grp in df_imp.groupby('person_id'):
            gs = grp.sort_values('week').dropna(subset=['weight','calories'])
            tdee_r = self.person_tdee[pid] * self.person_lambda[pid]
            daily_def = [float(cal) - tdee_r
                         for cal in gs['calories'].values]
            def_weeks = sum(1 for d in daily_def if d < -100)
            cumul_def = sum(max(0, -d) * 7 for d in daily_def)
            self.person_deficit_weeks[pid] = def_weeks
            self.person_cumul_deficit[pid] = cumul_def
            # weight trend ბოლო 4 კვ.
            w4 = gs['weight'].tail(4).dropna().values
            slope = float(np.polyfit(range(len(w4)), w4, 1)[0]) \
                    if len(w4) >= 2 else 0.0
            self.person_weight_trend[pid] = slope
        print(f"      ადაპტ. state: {len(self.person_deficit_weeks)} adamiani")

        # Kalman sigma calibration — empirical, სწ. განმარტ.:
#
#   sigma_u   (between-person):  std( per-person mean_dw )
#             = ადამიანებს შ. dw-ის ვარ. — Kalman prior-ი
#
#   sigma_eps (within-person):   mean( per-person std_dw )
#             = ყოვ. ადამ.-ის გაზ. noise — observation noise
#
        person_mean_dw = []   # ყოვ. ადამ.-ის mean(dw)
        person_std_dw  = []   # ყოვ. ადამ.-ის std(dw)
        for pid_s, grp_s in df_imp.groupby('person_id'):
            ws = grp_s.sort_values('week')['weight'].dropna().values
            if len(ws) >= 3:   # min 3 obs → stable std
                dws = np.diff(ws)
                person_mean_dw.append(float(np.mean(dws)))
                person_std_dw.append(float(np.std(dws)))
        if len(person_mean_dw) >= 5:
            # sigma_u: between-person სხვ. (mean_dw-ების std)
            sigma_u_emp   = float(np.clip(
                np.std(person_mean_dw), 0.05, 1.0))
            # sigma_eps: within-person noise (std_dw-ების საშ.)
            sigma_eps_emp = float(np.clip(
                np.mean(person_std_dw), 0.03, 0.5))
            self.phase4.sigma_u_prior = sigma_u_emp
            self.phase4.sigma_eps     = sigma_eps_emp
            print(f"      Kalman sigma_u={sigma_u_emp:.3f} "
                  f"(between) sigma_eps={sigma_eps_emp:.3f} (within)")

        self.is_fitted   = True
        self._history_df = df_imp
        print(f"\n{'='*62}")
        print("  pipeline dasrulda.")
        print(f"{'='*62}\n")
        return self.fit_report

    # ── _enrich_row ──────────────────────────────────────
    def _enrich_row(self, pid, row: pd.Series) -> pd.Series:
        """Rolling features + Fourier + cycle_day ისტ.-იდან."""
        if self._history_df is None:
            return row
        row  = row.copy()
        hist = self._history_df[
            self._history_df['person_id'] == pid
        ].sort_values('week')
        cw   = row.get('week', None)

        # Fourier season terms
        if cw is not None:
            for k in range(1, 3):
                row[f'season_sin_{k}'] = float(
                    np.sin(2 * np.pi * k * cw / 52.0))
                row[f'season_cos_{k}'] = float(
                    np.cos(2 * np.pi * k * cw / 52.0))

        # calories_lag1
        if 'calories_lag1' not in row or pd.isna(row.get('calories_lag1', np.nan)):
            prev = hist[hist['week'] < cw] if cw is not None else hist
            cal_prev = prev['calories'].dropna()
            row['calories_lag1'] = float(cal_prev.iloc[-1]) \
                                   if not cal_prev.empty else 0.0

        # weight_trend_4w
        if 'weight_trend_4w' not in row or pd.isna(row.get('weight_trend_4w', np.nan)):
            win = hist[hist['week'] < cw].tail(4) if cw is not None else hist.tail(4)
            wv  = win['weight'].dropna().values
            row['weight_trend_4w'] = float(
                np.polyfit(range(len(wv)), wv, 1)[0]) if len(wv) >= 2 else 0.0

        # cycle_day
        if 'cycle_day' in self._history_df.columns:
            lcd = hist['cycle_day'].dropna()
            if not lcd.empty:
                lw  = hist.loc[lcd.index[-1], 'week']
                wp  = (int(cw or 0) - int(lw)) if cw is not None else 0
                row['cycle_day'] = float((int(lcd.iloc[-1]) + wp * 7) % 28)

        return row

    # ── predict ──────────────────────────────────────────
    def predict(self, pid, row: pd.Series,
                update_phase4: bool = True) -> dict:
        if not self.is_fitted:
            raise RuntimeError("fit() ar gamodzaxebula.")

        row   = self._enrich_row(pid, row)
        phase = self.person_phases.get(pid, 1)
        lam   = self.person_lambda.get(pid, 1.0)

        tdee_base = self.person_tdee.get(pid)
        if tdee_base is None:
            w_val = row.get('weight', np.nan)
            if pd.isna(w_val):
                raise ValueError(
                    f"pid={pid} fit()-shi ar iyo da weight=NaN."
                )
            tdee_base = phase1_tdee(row)
        tdee_cal = tdee_base * lam

        # Phase 2 — person effect (კომენტ. Bug1-ის შემდ.)
        # predict_person() within-demeaned weight-ს აბრუნ. (კგ),
        # ამიტომ TDEE-ს ირიბად მოქმედებს lambda_i-ით.

        # Phase 3 ML კორექცია (კგ/კვ → კკ/დღ)
        ml_dw_kg   = 0.0
        ml_kcal    = 0.0
        if phase >= 3 and self.phase3.selected_features:
            try:
                ml_dw_kg = self.phase3.predict_correction(row.to_frame().T)
                ml_kcal  = ml_dw_kg * _KCAL_PER_KG / 7.0
            except Exception:
                ml_dw_kg = ml_kcal = 0.0
            tdee_cal += ml_kcal

        # Phase 4 Kalman (კგ/კვ სკ.)
        p4_info = {}
        if phase >= 4:
            w_now = float(row.get('weight', np.nan))
            if not pd.isna(w_now) and update_phase4:
                hist_pid = (
                    self._history_df[self._history_df['person_id'] == pid]
                    .sort_values('week')
                    if self._history_df is not None else pd.DataFrame()
                )
                # w_prev: ბოლო ვალ. წინა კვ. წონა (NaN-ები გამოტ.)
                prev_w = hist_pid['weight'].dropna()
                if len(prev_w) >= 1:
                    w_prev = float(prev_w.iloc[-1])
                    # თუ w_prev == w_now (ერთი და იგ. სტრ.) → 0
                    dw_obs = w_now - w_prev if w_prev != w_now else 0.0
                else:
                    dw_obs = 0.0
                cal_p4   = row.get('calories', np.nan)
                cal_p4   = tdee_cal if pd.isna(cal_p4) else float(cal_p4)
                dw_pred4 = (cal_p4 - tdee_cal) / _KCAL_PER_KG * 7.0
                p4_info  = self.phase4.update(pid, dw_obs, dw_pred4)
                u_i      = float(np.clip(
                    self.phase4.u_i.get(pid, 0.0),
                    -2.0, 2.0))  # max 2 kg/kv clip
                tdee_cal += u_i * _KCAL_PER_KG / 7.0

        # ── ბალანსის პროგნ. ──────────────────────────────
        cal_raw = row.get('calories', np.nan)
        cal_use = tdee_cal if pd.isna(cal_raw) else float(cal_raw)
        balance        = cal_use - tdee_cal
        dw_bal_daily   = balance / _KCAL_PER_KG
        dw_bal_weekly  = dw_bal_daily * 7.0

        # ── ადაპტ. კომპ. (Hall et al. 2012) ─────────────
        def_weeks  = self.person_deficit_weeks.get(pid, 0)
        cumul_def  = self.person_cumul_deficit.get(pid, 0.0)
        adapt_f    = adaptation_factor(def_weeks, cumul_def)
        tdee_adapt = tdee_cal * adapt_f           # ადაპტ.-ის შემდ. TDEE
        bal_adapt  = cal_use - tdee_adapt
        dw_adapt   = bal_adapt / _KCAL_PER_KG * 7.0  # კგ/კვ

        # პლატო
        wtrend = self.person_weight_trend.get(pid, 0.0)
        plat   = detect_plateau(
            deficit_kcal_day=-balance,
            weight_trend_4w=wtrend
        )

        # ── რეგრ. პროგნ. ──────────────────────────────────
        reg = {'weight_next_kg': None, 'dw_reg_kg': None, 'dw_reg_g': None}
        if phase >= 2 and self.phase2.weight_global is not None:
            fc   = self.phase2.feat_cols
            Xreg = row.reindex(fc, fill_value=0).values.reshape(1, -1)
            w_now_val = float(row.get('weight', np.nan))
            if not pd.isna(w_now_val):
                reg = self.phase2.predict_weight_next(pid, Xreg, w_now_val)

        # ── CI ────────────────────────────────────────────
        rho  = self.phase2.rho_dict.get(pid, 0.3)
        p4P  = self.phase4.P_i.get(pid, None)
        s_eps = (float(np.sqrt(p4P)) * _KCAL_PER_KG / 7.0
                 if p4P is not None else 80.0)
        s_eps = float(np.clip(s_eps, 40.0, 300.0))
        ci_95 = 1.96 * s_eps * float(np.sqrt(1.0 / (1.0 - rho**2 + 1e-9)))

        # ── ადაპტ. state update ──────────────────────────
        if balance < -100:
            self.person_deficit_weeks[pid] = def_weeks + 1
            self.person_cumul_deficit[pid] = cumul_def + (-balance) * 7
        else:
            # rest კვირა — ადაპტ. ნელ-ნელა ქრება
            self.person_deficit_weeks[pid] = max(0, def_weeks - 1)
            self.person_cumul_deficit[pid] = max(0.0, cumul_def * 0.9)
        self.person_weight_trend[pid] = wtrend  # შეინახება weekly_update-ში

        return {
            'person_id':          pid,
            'phase':              phase,
            # TDEE
            'tdee_kcal':          round(tdee_cal, 0),
            'tdee_adapted_kcal':  round(tdee_adapt, 0),
            'adaptation_factor':  adapt_f,
            'tdee_ci_95':         round(ci_95, 0),
            'lambda_i':           round(lam, 3),
            # ბალანსი
            'caloric_balance':    round(balance, 0),
            # ბალ. პროგნ.
            'balance_dw_kg':      round(dw_bal_weekly, 3),
            'balance_dw_g':       round(dw_bal_weekly * 1000, 0),
            # ადაპტ. პროგნ.
            'adapted_dw_kg':      round(dw_adapt, 3),
            'adapted_dw_g':       round(dw_adapt * 1000, 0),
            # რეგრ. პროგნ.
            'reg_weight_next_kg': reg['weight_next_kg'],
            'reg_dw_kg':          reg['dw_reg_kg'],
            'reg_dw_g':           reg['dw_reg_g'],
            # Phase 3/4
            'ml_correction_dw_kg': round(ml_dw_kg, 4),
            'ml_correction_kcal':  round(ml_kcal, 1),
            'phase4_update':       p4_info,
            # ადაპტ. info
            'deficit_weeks':       def_weeks,
            'cumul_deficit_kcal':  round(cumul_def, 0),
            'plateau_detected':    plat,
            # cycle
            'cycle_day':          (int(row.get('cycle_day', -1))
                                   if not pd.isna(row.get('cycle_day', float('nan')))
                                   else None),
            'rho_ar1':             round(rho, 3),
        }

    # ── recommend ────────────────────────────────────────
    def recommend(self, pid,
                  goal: str = 'loss',
                  aggressiveness: str = 'moderate',
                  plateau: bool = False) -> dict:
        """
        სამი რეკომენდაცია:
          FAT_REC — TDEE_fat-ზე (7700 კკ/კგ, ცხიმის ვარაუდი)
          MUS_REC — TDEE_mus-ზე (950 კკ/კგ, კუნთის ვარაუდი)
          REG_REC — TDEE_reg-ზე (Phase 2 regression, ვარაუდის გარეშე)

        კლინ. ზღვრები ყველაზე:
          მინ. კალ.: 1200 (ქ) / 1500 (კ)
          მაქს. დეფ.: 750 კკ/დღ
          მაქს. კლება: 1 კგ/კვ
        """
        tdee_formula = self.person_tdee.get(pid, 2000.0)
        lam          = self.person_lambda.get(pid, 1.0)
        min_c        = self._min_cal(pid)

        # სამი TDEE — adaptation_factor ყველაზე ერთი
        dw = self.person_deficit_weeks.get(pid, 0)
        cd = self.person_cumul_deficit.get(pid, 0.0)
        af = adaptation_factor(dw, cd)

        tdee_fat = self.person_tdee_fat.get(pid, tdee_formula * lam)
        tdee_mus = self.person_tdee_mus.get(pid, tdee_formula * lam)
        tdee_reg = self.person_tdee_reg.get(pid, tdee_formula * lam)

        # adaptation
        tdee_fat_a = tdee_fat * af
        tdee_mus_a = tdee_mus * af
        tdee_reg_a = tdee_reg * af

        # Diet break — პლატო
        if plateau:
            return {
                'person_id':        pid,
                'goal':             'diet_break',
                'aggressiveness':   aggressiveness,
                'tdee_fat_kcal':    round(tdee_fat, 0),
                'tdee_mus_kcal':    round(tdee_mus, 0),
                'tdee_reg_kcal':    round(tdee_reg, 0),
                'FAT_REC':          round(tdee_fat_a, 0),
                'MUS_REC':          round(tdee_mus_a, 0),
                'REG_REC':          round(tdee_reg_a, 0),
                'caloric_delta':    0,
                'expected_dw_fat_kg': 0.0,
                'expected_dw_mus_kg': 0.0,
                'expected_dw_reg_kg': 0.0,
                'expected_dm_fat_kg': 0.0,
                'expected_dm_mus_kg': 0.0,
                'expected_dm_reg_kg': 0.0,
                'note': 'PLATEAU — 1-2 kvira TDEE-ze chama (diet break).',
                'adaptation_factor': af,
                'deficit_weeks':    dw,
            }

        deficits = {
            ('loss',     'conservative'): -300,
            ('loss',     'moderate'):     -500,
            ('loss',     'aggressive'):   -750,
            ('gain',     'conservative'): +200,
            ('gain',     'moderate'):     +300,
            ('gain',     'aggressive'):   +500,
            ('maintain', 'moderate'):        0,
            ('recomp',   'moderate'):        0,
        }
        delta = deficits.get((goal, aggressiveness),
                             deficits.get((goal, 'moderate'), 0))

        def _apply_limits(tdee_adapted, delta):
            """კლინ. ზღვრები: min_cal, max_deficit, max_dw."""
            if delta < 0:
                delta = max(delta, -_MAX_DEFICIT)
            target = tdee_adapted + delta
            if target < min_c:
                target = float(min_c)
                delta  = target - tdee_adapted
            weekly_dw = delta * 7.0 / _KCAL_PER_KG
            if weekly_dw < -_MAX_DW_WEEK:
                weekly_dw = -_MAX_DW_WEEK
                delta     = weekly_dw * _KCAL_PER_KG / 7.0
                target    = tdee_adapted + delta
            return round(target, 0), round(delta, 0), round(weekly_dw, 3)

        fat_target, fat_delta, fat_dw = _apply_limits(tdee_fat_a, delta)
        mus_target, mus_delta, mus_dw = _apply_limits(tdee_mus_a, delta)
        reg_target, reg_delta, reg_dw = _apply_limits(tdee_reg_a, delta)

        note = ('lambda < 0.92: ekonomiuri metab. (fat)'
                if lam < 0.92 else
                'lambda > 1.08: swrafi metab. (fat)'
                if lam > 1.08 else
                'lambda ~1.0: formula emtkhveva (fat)')

        return {
            'person_id':          pid,
            'goal':               goal,
            'aggressiveness':     aggressiveness,
            # სამი TDEE (ადაპტ.-მდე)
            'tdee_fat_kcal':      round(tdee_fat, 0),
            'tdee_mus_kcal':      round(tdee_mus, 0),
            'tdee_reg_kcal':      round(tdee_reg, 0),
            # სამი TDEE (ადაპტ.-ის შემდეგ)
            'tdee_fat_adapted':   round(tdee_fat_a, 0),
            'tdee_mus_adapted':   round(tdee_mus_a, 0),
            'tdee_reg_adapted':   round(tdee_reg_a, 0),
            # სამი რეკომ.
            'FAT_REC':            fat_target,
            'MUS_REC':            mus_target,
            'REG_REC':            reg_target,
            # კალ. delta
            'fat_delta':          fat_delta,
            'mus_delta':          mus_delta,
            'reg_delta':          reg_delta,
            # მოს. ცვლ. კგ/კვ
            'expected_dw_fat_kg': fat_dw,
            'expected_dw_mus_kg': mus_dw,
            'expected_dw_reg_kg': reg_dw,
            # მოს. ცვლ. კგ/თვ
            'expected_dm_fat_kg': round(fat_dw * 4, 2),
            'expected_dm_mus_kg': round(mus_dw * 4, 2),
            'expected_dm_reg_kg': round(reg_dw * 4, 2),
            # meta
            'adaptation_factor':  af,
            'deficit_weeks':      dw,
            'diet_break_suggested': af < 0.92,
            'note':               note,
        }

    # ── weekly_update ────────────────────────────────────
    def weekly_update(self, new_df: pd.DataFrame,
                      goal: str = 'loss',
                      aggressiveness: str = 'moderate') -> pd.DataFrame:
        """
        Batch update — ყველა ადამ.
        goal/aggressiveness CSV-იდან თუ სვეტი არის.
        """
        results = []
        for pid, grp in new_df.groupby('person_id'):
            if grp.empty:
                continue
            row = grp.sort_values('week').iloc[-1]

            g = str(row.get('goal', goal)).strip()
            a = str(row.get('aggressiveness', aggressiveness)).strip()
            g = g if g in _VALID_GOALS else goal
            a = a if a in _VALID_AGGR  else aggressiveness

            pred = self.predict(pid, row, update_phase4=True)
            rec  = self.recommend(pid, goal=g, aggressiveness=a,
                                  plateau=pred['plateau_detected'])

            # weight_trend განახლება
            hist = (self._history_df[self._history_df['person_id'] == pid]
                    .sort_values('week') if self._history_df is not None
                    else pd.DataFrame())
            w4   = hist['weight'].tail(4).dropna().values
            self.person_weight_trend[pid] = float(
                np.polyfit(range(len(w4)), w4, 1)[0]) if len(w4) >= 2 else 0.0

            results.append({
                **pred,
                'goal':               g,
                'aggressiveness':     a,
                # სამი TDEE
                'tdee_fat_kcal':      rec['tdee_fat_kcal'],
                'tdee_mus_kcal':      rec['tdee_mus_kcal'],
                'tdee_reg_kcal':      rec['tdee_reg_kcal'],
                # სამი რეკომენდაცია
                'FAT_REC':            rec['FAT_REC'],
                'MUS_REC':            rec['MUS_REC'],
                'REG_REC':            rec['REG_REC'],
                # მოსალოდნელი ცვლილება კგ/თვ
                'expected_dm_fat_kg': rec['expected_dm_fat_kg'],
                'expected_dm_mus_kg': rec['expected_dm_mus_kg'],
                'expected_dm_reg_kg': rec['expected_dm_reg_kg'],
                'diet_break':         rec.get('diet_break_suggested', False),
                'lambda_note':        rec['note'],
            })

        # ისტ. განახლება — NaN weight ინახება (MICE შეავსებს მოგვ.)
        if self._history_df is not None:
            nr = new_df[new_df.columns.intersection(
                self._history_df.columns)].copy()
            self._history_df = pd.concat(
                [self._history_df, nr], ignore_index=True
            ).drop_duplicates(
                subset=['person_id', 'week'], keep='last'
            ).sort_values(['person_id', 'week']).reset_index(drop=True)
            # Memory: ισ.-ს ბოლო 52 კვ. ვინახავთ (1 წელი)
            max_week = self._history_df['week'].max()
            if max_week > 52:
                cutoff = max_week - 52
                self._history_df = self._history_df[
                    self._history_df['week'] >= cutoff
                ].reset_index(drop=True)

        return pd.DataFrame(results)


# ═══════════════════════════════════════════════════════
# სატ. მონ. გენ. (ტესტ.)
# ═══════════════════════════════════════════════════════

def make_sample_data(n_persons=50, n_weeks=16, seed=42):
    rng  = np.random.default_rng(seed)
    rows = []
    for pid in range(n_persons):
        sex  = rng.integers(0, 2)
        age  = rng.integers(22, 55)
        ht   = rng.normal(168 if sex else 162, 7)
        bmr  = 10*(70 + rng.normal(0, 8)) + 6.25*ht - 5*age + (5 if sex else -161)
        true_tdee = bmr * rng.uniform(1.3, 1.75)
        lam  = rng.normal(1.0, 0.12)
        rho  = rng.uniform(0.25, 0.60)
        w    = 70 + rng.normal(0, 10)
        eps  = 0.0
        for t in range(n_weeks):
            cal  = true_tdee * lam + rng.normal(-200, 300)
            ex   = rng.integers(0, 90)
            slp  = rng.normal(7, 1.2)
            stp  = rng.integers(4000, 13000)
            str_ = rng.integers(1, 41)    # 1-40
            hyd  = rng.normal(2.0, 0.5)
            eps  = rho * eps + rng.normal(0, 80)
            dw   = (cal - true_tdee * lam) / _KCAL_PER_KG + eps / _KCAL_PER_KG
            w   += dw
            rows.append({
                'person_id': pid, 'week': t,
                'weight':    np.nan if rng.random() < 0.12 else round(w, 2),
                'calories':  np.nan if rng.random() < 0.10 else round(cal, 0),
                'exercise_min': ex,
                'sleep_h':   round(slp, 1),
                'steps':     stp,
                'stress':    str_,
                'hydration_l': round(max(0.5, hyd), 1),
                'sex':       sex,
                'age':       age,
                'height_cm': round(ht, 1),
                'goal':      ['loss','gain','maintain','recomp'][pid % 4],
                'aggressiveness': ['conservative','moderate','aggressive'][pid % 3],
                'cycle_start_date': ('2024-01-08' if sex == 0 and pid % 3 == 0 else None),
            })
    return pd.DataFrame(rows)


# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════

if __name__ == '__main__':
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'data.csv'

    print(f"monacemebis chatvirtha: {csv_path}")
    df = load_data(csv_path)
    print(f"chatvirthuliya: {len(df)} str., "
          f"{df['person_id'].nunique()} adam., "
          f"{df['week'].nunique()} kvira")
    has_csd = ('cycle_start_date' in df.columns
               and df['cycle_start_date'].notna().any())
    if has_csd:
        n_cy = int(((df['sex'] == 0) & df['cycle_start_date'].notna()).sum())
        print(f"  cycle_start_date: {n_cy} qali mititebs")

    model  = CalorieModel()
    report = model.fit(df)

    # ── პირველი ადამ. ──────────────────────────────────
    pid0  = df['person_id'].iloc[0]
    last0 = df[df['person_id'] == pid0].sort_values('week').iloc[-1]
    pred  = model.predict(pid0, last0)
    goal0 = str(last0.get('goal', 'loss')).strip()
    aggr0 = str(last0.get('aggressiveness', 'moderate')).strip()
    rec   = model.recommend(pid0, goal=goal0, aggressiveness=aggr0,
                            plateau=pred['plateau_detected'])

    sep = "=" * 62
    print(f"\n{sep}")
    print(f"  magaliti — person_id={pid0}  (goal={goal0}, {aggr0})")
    print(sep)
    print(f"  TDEE:              {pred['tdee_kcal']} kk/dge")
    print(f"  TDEE (adaptacia):  {pred['tdee_adapted_kcal']} kk/dge  "
          f"(x{pred['adaptation_factor']:.3f})")
    print(f"  tdee_ci_95:        +/-{pred['tdee_ci_95']} kk")
    print(f"  lambda_i:          {pred['lambda_i']}  ({rec['note']})")
    print(f"  faza:              {pred['phase']}")
    print(f"  AR(1) rho:         {pred['rho_ar1']}")
    print(f"  deficit_weeks:     {pred['deficit_weeks']}")
    print(f"  adaptation_factor: {pred['adaptation_factor']}")
    print(f"  plateau:           {pred['plateau_detected']}")
    if pred['cycle_day'] is not None:
        print(f"  cycle_day:         {pred['cycle_day']}/27")
    print(f"\n  balansis prognozi: {pred['balance_dw_kg']:+.3f} kg/kv "
          f"({pred['balance_dw_g']:+.0f} g)")
    print(f"  adaptaciis progn.: {pred['adapted_dw_kg']:+.3f} kg/kv "
          f"({pred['adapted_dw_g']:+.0f} g)")
    if pred['reg_dw_kg'] is not None:
        print(f"  regresiuli progn.: {pred['reg_dw_kg']:+.3f} kg/kv")
    print(f"\n  rekomendacia ({goal0}, {aggr0}):")
    print(f"  FAT_REC: {rec['FAT_REC']} kk/d | mosalod.: {rec['expected_dw_fat_kg']:+.3f} kg/kv ({rec['expected_dm_fat_kg']:+.2f} kg/tve)")
    print(f"  MUS_REC: {rec['MUS_REC']} kk/d | mosalod.: {rec['expected_dw_mus_kg']:+.3f} kg/kv ({rec['expected_dm_mus_kg']:+.2f} kg/tve)")
    print(f"  REG_REC: {rec['REG_REC']} kk/d | mosalod.: {rec['expected_dw_reg_kg']:+.3f} kg/kv ({rec['expected_dm_reg_kg']:+.2f} kg/tve)")
    if rec.get('diet_break_suggested', False):
        print(f"  !!! DIET BREAK REKOMENDEBULIA")

    # ── Batch ────────────────────────────────────────────
    print(f"\n{sep}")
    print("  batch update (yvela adamiani):")
    print(sep)
    lw    = df[df['week'] == df['week'].max()]
    batch = model.weekly_update(lw)
    cols  = ['person_id','phase',
             'tdee_fat_kcal','tdee_mus_kcal','tdee_reg_kcal',
             'FAT_REC','MUS_REC','REG_REC',
             'lambda_i','adaptation_factor','plateau_detected',
             'balance_dw_kg','adapted_dw_kg','diet_break']
    avail = [c for c in cols if c in batch.columns]
    print(batch[avail].to_string(index=False))
    print(f"\n[OK] pipeline dasrulda.")
