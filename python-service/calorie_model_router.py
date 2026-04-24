from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import pandas as pd
import sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
router = APIRouter()
_model = None

def get_model():
    global _model
    if _model is None:
        from calorie_model_v2 import CalorieModel
        _model = CalorieModel(outlier_fraction=0.07)
    return _model

class CheckinItem(BaseModel):
    person_id: str
    week: int
    weight_kg: float = Field(..., ge=20, le=300)
    calories: int = Field(..., ge=500, le=10000)
    exercise_min: int = Field(0, ge=0, le=900)
    sleep_h: float = Field(7.0, ge=2, le=14)
    steps: int = Field(7500, ge=0, le=80000)
    stress: int = Field(10, ge=1, le=40)
    hydration_l: float = Field(2.0, ge=0.5, le=10)
    sex: int = Field(1, ge=0, le=1)
    age: int = Field(25, ge=16, le=100)
    height_cm: float = Field(170.0, ge=100, le=250)
    goal: str = 'loss'
    aggressiveness: str = 'moderate'
    target_weight_kg: Optional[float] = None
    cycle_start_date: Optional[str] = None

class FitRequest(BaseModel):
    checkins: List[CheckinItem]

class PredictRequest(BaseModel):
    person_id: str
    week: int
    weight_kg: float = Field(..., ge=20, le=300)
    calories: int = Field(..., ge=500, le=10000)
    exercise_min: int = Field(0, ge=0, le=900)
    sleep_h: float = Field(7.0, ge=2, le=14)
    steps: int = Field(7500, ge=0, le=80000)
    stress: int = Field(10, ge=1, le=40)
    hydration_l: float = Field(2.0, ge=0.5, le=10)
    sex: int = Field(1, ge=0, le=1)
    age: int = Field(25, ge=16, le=100)
    height_cm: float = Field(170.0, ge=100, le=250)
    goal: str = 'loss'
    aggressiveness: str = 'moderate'
    target_weight_kg: Optional[float] = None
    cycle_start_date: Optional[str] = None

def calc_dynamic_delta(
    current_kg: float,
    target_kg: Optional[float],
    goal: str,
    aggressiveness: str,
    sex: int
) -> float:
    """
    სამიზნე წონიდან delta-ს დინამიური გამოთვლა.
    თუ target_weight_kg არ არის — ფიქსირებული delta.
    კლინიკური ზღვრები:
      max deficit: 750 კკ/დღე
      max surplus: 500 კკ/დღე
      min calories: 1200 (ქ) / 1500 (კ)
    """
    from calorie_model_v2 import _MAX_DEFICIT, _KCAL_PER_KG, _MAX_DW_WEEK

    # ფიქსირებული delta თუ target არ არის
    fixed = {
        ('loss',     'conservative'): -300,
        ('loss',     'moderate'):     -500,
        ('loss',     'aggressive'):   -750,
        ('gain',     'conservative'): +200,
        ('gain',     'moderate'):     +300,
        ('gain',     'aggressive'):   +500,
        ('maintain', 'conservative'):    0,
        ('maintain', 'moderate'):        0,
        ('maintain', 'aggressive'):      0,
    }

    if target_kg is None or goal == 'maintain':
        return float(fixed.get((goal, aggressiveness), fixed.get((goal, 'moderate'), 0)))

    # სამიზნე წონიდან delta
    diff_kg = current_kg - target_kg  # დადებითი = კლება, უარყოფითი = მომატება

    if goal == 'loss' and diff_kg > 0:
        # თვეში რამდენი კგ-ის კლება: aggressiveness-ზე დაყრდნობით
        months_targets = {'conservative': 0.5, 'moderate': 0.8, 'aggressive': 1.0}
        kg_per_month = months_targets.get(aggressiveness, 0.8)
        # კკ/დღე დეფიციტი: kg_per_month * 7700 / 30
        delta = -(kg_per_month * _KCAL_PER_KG / 30.0)
        # კლინიკური ზღვარი
        delta = max(delta, -_MAX_DEFICIT)
    elif goal == 'gain' and diff_kg < 0:
        # თვეში რამდენი კგ-ის მომატება
        months_targets = {'conservative': 0.3, 'moderate': 0.5, 'aggressive': 0.7}
        kg_per_month = months_targets.get(aggressiveness, 0.5)
        delta = kg_per_month * _KCAL_PER_KG / 30.0
        delta = min(delta, 500)  # max surplus
    else:
        # მიზანი შეუსაბამოა (მაგ. loss მაგრამ target > current) — ნული
        delta = 0.0

    return float(delta)

@router.get("/status")
def status():
    m = get_model()
    return {"fitted": m.is_fitted, "persons": len(m.person_phases) if m.is_fitted else 0}

@router.post("/fit")
def fit(req: FitRequest):
    rows = [{
        'person_id': c.person_id, 'week': c.week, 'weight': c.weight_kg,
        'calories': float(c.calories), 'exercise_min': c.exercise_min,
        'sleep_h': c.sleep_h, 'steps': c.steps, 'stress': c.stress,
        'hydration_l': c.hydration_l, 'sex': c.sex, 'age': c.age,
        'height_cm': c.height_cm, 'goal': c.goal,
        'aggressiveness': c.aggressiveness,
        'cycle_start_date': c.cycle_start_date,
    } for c in req.checkins]
    df = pd.DataFrame(rows)
    m = get_model()
    try:
        m.fit(df)
        return {"success": True, "persons": len(m.person_phases)}
    except Exception as e:
        raise HTTPException(500, f"fit error: {str(e)}")

@router.post("/predict")
def predict(req: PredictRequest):
    from calorie_model_v2 import (
        phase1_tdee, _MIN_CAL_FEMALE, _MIN_CAL_MALE,
        _KCAL_PER_KG, _MAX_DEFICIT, _MAX_DW_WEEK
    )

    row = pd.Series({
        'person_id': req.person_id, 'week': req.week,
        'weight': req.weight_kg, 'calories': float(req.calories),
        'exercise_min': req.exercise_min, 'sleep_h': req.sleep_h,
        'steps': req.steps, 'stress': req.stress,
        'hydration_l': req.hydration_l, 'sex': req.sex,
        'age': req.age, 'height_cm': req.height_cm,
        'goal': req.goal, 'aggressiveness': req.aggressiveness,
        'cycle_start_date': req.cycle_start_date,
    })

    m = get_model()
    pid = req.person_id

    # delta — სამიზნე წონიდან დინამიურად
    delta = calc_dynamic_delta(
        req.weight_kg, req.target_weight_kg,
        req.goal, req.aggressiveness, req.sex
    )

    # Phase 1
    if not m.is_fitted or pid not in m.person_phases:
        try:
            tdee = phase1_tdee(row)
        except Exception as e:
            raise HTTPException(500, f"phase1_tdee error: {str(e)}")

        min_c = float(_MIN_CAL_FEMALE if req.sex == 0 else _MIN_CAL_MALE)
        target = max(tdee + delta, min_c)
        weekly_dw = delta * 7.0 / _KCAL_PER_KG
        if weekly_dw < -_MAX_DW_WEEK:
            weekly_dw = -_MAX_DW_WEEK
            delta = weekly_dw * _KCAL_PER_KG / 7.0
            target = max(tdee + delta, min_c)

        weeks_left = max(0, 4 - req.week)

        # სამიზნემდე დარჩენილი დრო
        eta_msg = ""
        if req.target_weight_kg and req.goal in ('loss', 'gain'):
            diff = abs(req.weight_kg - req.target_weight_kg)
            if weekly_dw != 0:
                weeks_needed = abs(diff / weekly_dw) if weekly_dw != 0 else 999
                months = round(weeks_needed / 4.3, 1)
                eta_msg = f" · სამიზნემდე ~{months} თვე"

        return {
            "person_id": pid, "phase": 1,
            "tdee_kcal": round(tdee),
            "fat_rec": round(target), "mus_rec": round(target), "reg_rec": round(target),
            "adaptation_factor": 1.0, "lambda_i": 1.0,
            "plateau_detected": False,
            "balance_dw_kg": round(weekly_dw, 3),
            "adapted_dw_kg": round(weekly_dw, 3),
            "expected_dm_fat_kg": round(weekly_dw * 4, 2),
            "expected_dm_mus_kg": round(weekly_dw * 4, 2),
            "expected_dm_reg_kg": round(weekly_dw * 4, 2),
            "diet_break_suggested": False,
            "deficit_weeks": 0, "rho_ar1": 0,
            "weeks_until_next_phase": weeks_left,
            "message": f"Phase 1 — Mifflin-St Jeor. კიდევ {weeks_left} კვ. Phase 2-მდე.{eta_msg}"
        }

    # Phase 2-4 — მოდელი + dynamic delta override
    try:
        pred = m.predict(pid, row, update_phase4=True)

        # recommend-ს dynamic delta გადავცეთ — override deficits
        rec = m.recommend(
            pid,
            goal=req.goal,
            aggressiveness=req.aggressiveness,
            plateau=pred['plateau_detected']
        )

        # თუ target_weight_kg არის, override delta
        if req.target_weight_kg and not pred['plateau_detected']:
            from calorie_model_v2 import _MIN_CAL_FEMALE, _MIN_CAL_MALE, _MAX_DW_WEEK
            min_c = float(_MIN_CAL_FEMALE if req.sex == 0 else _MIN_CAL_MALE)

            def apply_dynamic(tdee_adapted):
                t = max(tdee_adapted + delta, min_c)
                dw = delta * 7.0 / _KCAL_PER_KG
                if dw < -_MAX_DW_WEEK:
                    dw = -_MAX_DW_WEEK
                    t = max(tdee_adapted + dw * _KCAL_PER_KG / 7.0, min_c)
                return round(t), round(dw, 3)

            fat_t, fat_dw = apply_dynamic(rec.get('tdee_fat_adapted', pred['tdee_kcal']))
            mus_t, mus_dw = apply_dynamic(rec.get('tdee_mus_adapted', pred['tdee_kcal']))
            reg_t, reg_dw = apply_dynamic(rec.get('tdee_reg_adapted', pred['tdee_kcal']))
            rec['FAT_REC'] = fat_t; rec['MUS_REC'] = mus_t; rec['REG_REC'] = reg_t
            rec['expected_dm_fat_kg'] = round(fat_dw * 4, 2)
            rec['expected_dm_mus_kg'] = round(mus_dw * 4, 2)
            rec['expected_dm_reg_kg'] = round(reg_dw * 4, 2)

        phase = m.person_phases.get(pid, 1)
        next_phase_weeks = {1: 4, 2: 8, 3: 14}
        weeks_left = max(0, next_phase_weeks.get(phase, 14) - req.week)

        eta_msg = ""
        if req.target_weight_kg and req.goal in ('loss', 'gain'):
            diff = abs(req.weight_kg - req.target_weight_kg)
            dw = abs(rec.get('expected_dm_reg_kg', 0) / 4) if rec.get('expected_dm_reg_kg') else 0
            if dw > 0:
                months = round(diff / (dw * 4.3), 1)
                eta_msg = f" · სამიზნემდე ~{months} თვე"

        if pred['plateau_detected']:
            msg = "⚠️ პლატო! Diet break რეკომენდებულია."
        else:
            msgs = {1: f"Phase 1. {weeks_left} კვ. Phase 2-მდე.",
                    2: f"Phase 2 — პერსონ. {weeks_left} კვ. Phase 3-მდე.",
                    3: f"Phase 3 — ML. {weeks_left} კვ. Phase 4-მდე.",
                    4: "Phase 4 — Kalman Filter ✅"}
            msg = msgs.get(phase, "") + eta_msg

        return {
            "person_id": pid, "phase": phase,
            "tdee_kcal": pred['tdee_kcal'],
            "fat_rec": int(rec['FAT_REC']),
            "mus_rec": int(rec['MUS_REC']),
            "reg_rec": int(rec['REG_REC']),
            "adaptation_factor": pred['adaptation_factor'],
            "lambda_i": pred['lambda_i'],
            "plateau_detected": pred['plateau_detected'],
            "balance_dw_kg": pred['balance_dw_kg'],
            "adapted_dw_kg": pred['adapted_dw_kg'],
            "expected_dm_fat_kg": rec['expected_dm_fat_kg'],
            "expected_dm_mus_kg": rec['expected_dm_mus_kg'],
            "expected_dm_reg_kg": rec['expected_dm_reg_kg'],
            "diet_break_suggested": rec.get('diet_break_suggested', False),
            "deficit_weeks": pred.get('deficit_weeks', 0),
            "rho_ar1": pred.get('rho_ar1', 0),
            "weeks_until_next_phase": weeks_left,
            "message": msg
        }
    except Exception as e:
        raise HTTPException(500, f"predict error: {str(e)}")
