from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import numpy as np
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
    cycle_start_date: Optional[str] = None

@router.get("/status")
def status():
    m = get_model()
    return {"fitted": m.is_fitted, "persons": len(m.person_phases) if m.is_fitted else 0}

@router.post("/fit")
def fit(req: FitRequest):
    rows = [{
        'person_id': c.person_id, 'week': c.week,
        'weight': c.weight_kg, 'calories': float(c.calories),
        'exercise_min': c.exercise_min, 'sleep_h': c.sleep_h,
        'steps': c.steps, 'stress': c.stress,
        'hydration_l': c.hydration_l, 'sex': c.sex,
        'age': c.age, 'height_cm': c.height_cm,
        'goal': c.goal, 'aggressiveness': c.aggressiveness,
        'cycle_start_date': c.cycle_start_date,
    } for c in req.checkins]
    df = pd.DataFrame(rows)
    m = get_model()
    try:
        m.fit(df)
        return {"success": True, "persons": len(m.person_phases), "phases": dict(m.person_phases)}
    except Exception as e:
        raise HTTPException(500, f"fit error: {str(e)}")

@router.post("/predict")
def predict(req: PredictRequest):
    from calorie_model_v2 import (
        phase1_tdee, _MIN_CAL_FEMALE, _MIN_CAL_MALE,
        _KCAL_PER_KG, _KCAL_PER_KG_MUS, _MAX_DEFICIT, _MAX_DW_WEEK
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

    # Phase 1 — Mifflin-St Jeor
    if not m.is_fitted or pid not in m.person_phases:
        try:
            tdee = phase1_tdee(row)
        except Exception as e:
            raise HTTPException(500, f"phase1_tdee error: {str(e)}")

        min_c = _MIN_CAL_FEMALE if req.sex == 0 else _MIN_CAL_MALE

        deficits = {
            ('loss','conservative'): -300, ('loss','moderate'): -500,
            ('loss','aggressive'): -750,
            ('gain','conservative'): 200, ('gain','moderate'): 300,
            ('gain','aggressive'): 500,
            ('maintain','conservative'): 0, ('maintain','moderate'): 0, ('maintain','aggressive'): 0,
            ('recomp','moderate'): 0,
        }
        delta = deficits.get((req.goal, req.aggressiveness),
                             deficits.get((req.goal, 'moderate'), 0))

        # კლინიკური ზღვრები
        if delta < 0:
            delta = max(delta, -_MAX_DEFICIT)
        target = tdee + delta
        if target < min_c:
            target = float(min_c)
            delta = target - tdee
        weekly_dw = delta * 7.0 / _KCAL_PER_KG
        if weekly_dw < -_MAX_DW_WEEK:
            weekly_dw = -_MAX_DW_WEEK
            delta = weekly_dw * _KCAL_PER_KG / 7.0
            target = tdee + delta

        fat_target = round(target)
        mus_target = round(target)
        reg_target = round(target)
        dw = round(weekly_dw, 3)
        weeks_left = max(0, 4 - req.week)

        return {
            "person_id": pid, "phase": 1,
            "tdee_kcal": round(tdee),
            "fat_rec": fat_target,
            "mus_rec": mus_target,
            "reg_rec": reg_target,
            "adaptation_factor": 1.0,
            "lambda_i": 1.0,
            "plateau_detected": False,
            "balance_dw_kg": dw,
            "adapted_dw_kg": dw,
            "expected_dm_fat_kg": round(dw * 4, 2),
            "expected_dm_mus_kg": round(dw * 4, 2),
            "expected_dm_reg_kg": round(dw * 4, 2),
            "diet_break_suggested": False,
            "deficit_weeks": 0,
            "rho_ar1": 0,
            "weeks_until_next_phase": weeks_left,
            "message": f"Phase 1 — Mifflin-St Jeor. კიდევ {weeks_left} კვ. Phase 2-მდე."
        }

    # Phase 2-4
    try:
        pred = m.predict(pid, row, update_phase4=True)
        rec = m.recommend(
            pid,
            goal=req.goal,
            aggressiveness=req.aggressiveness,
            plateau=pred['plateau_detected']
        )
        phase = m.person_phases.get(pid, 1)
        next_phase_weeks = {1: 4, 2: 8, 3: 14}
        weeks_left = max(0, next_phase_weeks.get(phase, 14) - req.week)

        if pred['plateau_detected']:
            msg = "⚠️ პლატო! 1-2 კვირა TDEE-ზე ჭამა (diet break) რეკომენდებულია."
        else:
            msgs = {
                1: f"Phase 1 — Mifflin-St Jeor. კიდევ {weeks_left} კვ. Phase 2-მდე.",
                2: f"Phase 2 — პერსონალიზებული. კიდევ {weeks_left} კვ. Phase 3-მდე.",
                3: f"Phase 3 — ML კორექცია. კიდევ {weeks_left} კვ. Phase 4-მდე.",
                4: "Phase 4 — Kalman Filter. მაქსიმალური სიზუსტე! ✅",
            }
            msg = msgs.get(phase, "")

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
