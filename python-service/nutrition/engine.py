"""
FITPRICE — პერსონალიზაციის ძრავა
Mifflin-St Jeor BMR + მულტი-ფაქტორული კვების გეგმა
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import math

router = APIRouter()

# ══════════════════════════════════════════════════════════════
# მოდელები
# ══════════════════════════════════════════════════════════════

class ProfileRequest(BaseModel):
    gender: str                    # 'male' | 'female'
    age: int = Field(ge=10, le=100)
    weight_kg: float = Field(ge=30, le=300)
    height_cm: float = Field(ge=100, le=250)
    activity_level: str            # 'low' | 'medium' | 'high'
    goal: str                      # 'lose' | 'gain' | 'maintain'
    target_weight_kg: Optional[float] = None
    eating_window: str             # 'short' | 'standard' | 'long'
    carb_sensitivity: str          # 'high' | 'low' | 'neutral'
    hunger_peak: str               # 'morning' | 'evening' | 'even'
    calorie_multiplier: float = 1.0
    vegan_mode: bool = False

class CheckinRequest(BaseModel):
    current_weight_kg: float
    initial_weight_kg: float
    target_calories: float
    goal: str
    week_number: int
    energy_level: int = Field(ge=1, le=5)
    hunger_level: int = Field(ge=1, le=5)
    carb_sensitivity: str
    calorie_multiplier: float = 1.0

# ══════════════════════════════════════════════════════════════
# BMR — Mifflin-St Jeor (ყველაზე ზუსტი)
# ══════════════════════════════════════════════════════════════

def calc_bmr(gender: str, weight: float, height: float, age: int) -> float:
    if gender == 'male':
        return (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        return (10 * weight) + (6.25 * height) - (5 * age) - 161

def calc_tdee(bmr: float, activity: str) -> float:
    multipliers = {
        'low': 1.375,      # დაბალი
        'medium': 1.55,    # საშუალო
        'high': 1.725,     # მაღალი
    }
    return bmr * multipliers.get(activity, 1.55)

def calc_target_calories(tdee: float, goal: str, multiplier: float = 1.0) -> float:
    if goal == 'lose':
        # დეფიციტი: TDEE-დან 20% მაქს (უსაფრთხო ზღვარი)
        deficit = min(tdee * 0.20, 500)  # მაქს 500 კკალ დეფიციტი
        return round((tdee - deficit) * multiplier)
    elif goal == 'gain':
        surplus = min(tdee * 0.10, 300)  # მაქს 300 კკალ სერფლუსი
        return round((tdee + surplus) * multiplier)
    else:
        return round(tdee * multiplier)

# ══════════════════════════════════════════════════════════════
# მაკრო პროპორციები — კარბ-მგრძნობელობის მიხედვით
# ══════════════════════════════════════════════════════════════

def calc_macros(calories: float, carb_sensitivity: str, goal: str) -> dict:
    if carb_sensitivity == 'high':
        # მაღალი ნახშირწყლები
        p_pct, f_pct, c_pct = 0.25, 0.25, 0.50
    elif carb_sensitivity == 'low':
        # Low Carb (მაგრამ მინ. 130გ/დღე ტვინისთვის)
        p_pct, f_pct, c_pct = 0.35, 0.40, 0.25
    else:
        # ბალანსირებული
        p_pct, f_pct, c_pct = 0.30, 0.30, 0.40

    # მასის მომატებისთვის — მეტი ცილა
    if goal == 'gain':
        p_pct += 0.05
        c_pct -= 0.05

    protein_g = round((calories * p_pct) / 4)
    fat_g = round((calories * f_pct) / 9)
    carbs_g = round((calories * c_pct) / 4)

    # Low Carb-ის მინიმუმი — 130გ/დღე
    if carb_sensitivity == 'low' and carbs_g < 130:
        carbs_g = 130
        # ადაპტაცია ცხიმში
        remaining = calories - (protein_g * 4) - (carbs_g * 4)
        fat_g = round(remaining / 9)

    return {
        "protein": protein_g,
        "fat": fat_g,
        "carbs": carbs_g,
        "ratio": {"protein": p_pct, "fat": f_pct, "carbs": c_pct}
    }

# ══════════════════════════════════════════════════════════════
# კვებების განაწილება
# ══════════════════════════════════════════════════════════════

def calc_meal_plan(
    total_cal: float,
    eating_window: str,
    hunger_peak: str,
    macros: dict
) -> list:

    # კვებების რაოდენობა კვების ფანჯრის მიხედვით
    if eating_window == 'short':
        # IF 16/8 — 2 ნოყიერი კვება
        base_meals = [
            {"name": "პირველი კვება (Break-Fast)", "time": "12:00", "ratio": 0.50},
            {"name": "მეორე კვება (ვახშამი)", "time": "19:00", "ratio": 0.50},
        ]
    elif eating_window == 'long':
        # 5 მცირე კვება
        base_meals = [
            {"name": "საუზმე", "time": "07:00", "ratio": 0.20},
            {"name": "II საუზმე", "time": "10:00", "ratio": 0.15},
            {"name": "სადილი", "time": "13:00", "ratio": 0.25},
            {"name": "წახემსება", "time": "16:00", "ratio": 0.15},
            {"name": "ვახშამი", "time": "19:00", "ratio": 0.25},
        ]
    else:
        # სტანდარტული 3 + 1
        base_meals = [
            {"name": "საუზმე", "time": "09:00", "ratio": 0.25},
            {"name": "სადილი", "time": "13:00", "ratio": 0.35},
            {"name": "წახემსება", "time": "16:30", "ratio": 0.15},
            {"name": "ვახშამი", "time": "19:30", "ratio": 0.25},
        ]

    # შიმშილის პიკის მიხედვით კალორიების გადანაწილება
    if hunger_peak == 'morning' and len(base_meals) >= 2:
        # საუზმეზე მეტი კალორია
        base_meals[0]["ratio"] = min(base_meals[0]["ratio"] + 0.15, 0.55)
        base_meals[-1]["ratio"] = max(base_meals[-1]["ratio"] - 0.15, 0.10)
    elif hunger_peak == 'evening' and len(base_meals) >= 2:
        # ვახშამზე მეტი
        base_meals[0]["ratio"] = max(base_meals[0]["ratio"] - 0.10, 0.10)
        base_meals[-1]["ratio"] = min(base_meals[-1]["ratio"] + 0.10, 0.50)

    # ნორმალიზება (ჯამი = 1.0)
    total_ratio = sum(m["ratio"] for m in base_meals)
    for m in base_meals:
        m["ratio"] /= total_ratio

    # კალორიების გაანგარიშება
    meals = []
    for m in base_meals:
        cal = round(total_cal * m["ratio"])
        p = round(macros["protein"] * m["ratio"])
        f = round(macros["fat"] * m["ratio"])
        c = round(macros["carbs"] * m["ratio"])
        meals.append({
            "name": m["name"],
            "time": m["time"],
            "calories": cal,
            "protein": p,
            "fat": f,
            "carbs": c,
            "ratio": round(m["ratio"] * 100),
        })

    return meals

# ══════════════════════════════════════════════════════════════
# პროფილის კოდი
# ══════════════════════════════════════════════════════════════

def build_profile_code(goal, eating_window, carb_sensitivity, hunger_peak) -> str:
    g = {"lose": "L", "gain": "G", "maintain": "M"}.get(goal, "M")
    w = {"short": "S", "standard": "N", "long": "L"}.get(eating_window, "N")
    c = {"high": "HC", "low": "LC", "neutral": "BC"}.get(carb_sensitivity, "BC")
    h = {"morning": "AM", "evening": "PM", "even": "EV"}.get(hunger_peak, "EV")
    return f"{g}-{w}-{c}-{h}"

# ══════════════════════════════════════════════════════════════
# timeline
# ══════════════════════════════════════════════════════════════

def calc_timeline(weight: float, target: Optional[float], goal: str) -> Optional[str]:
    if not target:
        return None
    diff = abs(weight - target)
    if goal == 'lose':
        # 0.5-1 კგ/კვირა → საშუალო 0.75 კგ
        weeks = diff / 0.75
    elif goal == 'gain':
        # ~0.25 კგ კუნთი/კვირა (კვირაში 0.5 კგ სულ)
        weeks = diff / 0.5
    else:
        return None

    if weeks < 4:
        return f"~{round(weeks)} კვირა"
    months = weeks / 4.33
    return f"~{round(months, 1)} თვე"

# ══════════════════════════════════════════════════════════════
# კვირეული check-in ლოგიკა
# ══════════════════════════════════════════════════════════════

def process_checkin(req: CheckinRequest) -> dict:
    weight_change = req.current_weight_kg - req.initial_weight_kg
    # კვირაში
    weekly_change = weight_change / max(req.week_number, 1)

    status = "ok"
    new_calories = req.target_calories
    new_multiplier = req.calorie_multiplier
    reason = ""
    refeed = False
    warning = None

    if req.goal == 'lose':
        if weekly_change < -1.5:
            # ძალიან სწრაფი კლება
            if req.week_number == 1 and weekly_change > -3.0:
                # პირველი კვირა — შესაძლოა წყლის დაკარგვა
                status = "first_week_water"
                warning = "⚠️ პირველ კვირაში ნორმალურია 2-3 კგ-ის დაკარგვა წყლის გამო. შემდეგ კვირაში ვნახავთ ნამდვილ პროგრესს."
                reason = "პირველი კვირის წყლის ეფექტი"
            else:
                status = "losing_fast"
                new_multiplier = min(req.calorie_multiplier + 0.10, 1.20)
                new_calories = req.target_calories * (1 + 0.10)
                reason = "ძალიან სწრაფი კლება — +10% კალორია უსაფრთხოებისთვის"
                warning = "⚠️ კვირაში 1.5 კგ-ზე მეტი კლება შეიძლება კუნთის დაკარგვას ნიშნავდეს."
        elif -1.0 <= weekly_change <= -0.3:
            status = "losing_ideal"
            reason = "იდეალური პროგრესი ✅"
        elif -0.3 < weekly_change < 0.2:
            # პლატო
            status = "plateau"
            new_multiplier = max(req.calorie_multiplier - 0.05, 0.80)
            new_calories = req.target_calories * 0.95
            refeed = True
            reason = "პლატო გამოვლინდა — -5% კალორია + 2-დღიანი refeed რეკომენდებულია"
            warning = "🔄 მეტაბოლური ადაპტაცია. 2 დღე ჭამე ნორმალურ კალორიებზე, შემდეგ გაგრძელდება გეგმა."
        else:
            status = "gaining_on_lose"
            new_multiplier = max(req.calorie_multiplier - 0.08, 0.75)
            new_calories = req.target_calories * 0.92
            reason = "წონა მოიმატა კლების გეგმაზე — -8% კალორია"

    elif req.goal == 'gain':
        if weekly_change >= 0.3:
            status = "gaining_ideal"
            reason = "კარგი პროგრესი ✅"
        elif weekly_change < 0.1:
            status = "not_gaining"
            new_multiplier = min(req.calorie_multiplier + 0.05, 1.30)
            new_calories = req.target_calories * 1.05
            reason = "წონა არ იმატებს — +5% კალორია + ცხიმის წყარო დაემატება"

    elif req.goal == 'maintain':
        if abs(weekly_change) <= 0.25:
            status = "maintaining"
            reason = "სტაბილური წონა ✅"
        elif weekly_change > 0.25:
            new_calories = req.target_calories * 0.97
            reason = "მცირე კორექცია -3%"
        else:
            new_calories = req.target_calories * 1.03
            reason = "მცირე კორექცია +3%"

    # ენერგიის დონე
    energy_note = None
    if req.energy_level <= 2:
        if req.carb_sensitivity == 'low':
            energy_note = "⚡ დაღლილობა Low Carb-ზე — ვარჯიშამდე +30გ ნახშირწყალი (ბანანი ან ბრინჯი)"
        else:
            energy_note = "⚡ დაბალი ენერგია — შეამოწმე წყლის მიღება და ძილის ხარისხი"

    return {
        "status": status,
        "new_calories": round(new_calories),
        "new_multiplier": round(new_multiplier, 3),
        "adjustment_reason": reason,
        "refeed_recommended": refeed,
        "warning": warning,
        "energy_note": energy_note,
        "weekly_change_kg": round(weekly_change, 2),
    }

# ══════════════════════════════════════════════════════════════
# API endpoints
# ══════════════════════════════════════════════════════════════

@router.post("/calculate")
def calculate_profile(req: ProfileRequest):
    # BMR (Mifflin-St Jeor)
    bmr = calc_bmr(req.gender, req.weight_kg, req.height_cm, req.age)
    tdee = calc_tdee(bmr, req.activity_level)
    target_cal = calc_target_calories(tdee, req.goal, req.calorie_multiplier)

    # უსაფრთხოების ქვედა ზღვარი
    min_cal = 1200 if req.gender == 'female' else 1500
    target_cal = max(target_cal, min_cal)

    macros = calc_macros(target_cal, req.carb_sensitivity, req.goal)
    meals = calc_meal_plan(target_cal, req.eating_window, req.hunger_peak, macros)
    profile_code = build_profile_code(req.goal, req.eating_window, req.carb_sensitivity, req.hunger_peak)
    timeline = calc_timeline(req.weight_kg, req.target_weight_kg, req.goal)

    # BMI
    bmi = round(req.weight_kg / ((req.height_cm / 100) ** 2), 1)
    if bmi < 18.5: bmi_class = "დაბალი"
    elif bmi < 25: bmi_class = "ნორმა"
    elif bmi < 30: bmi_class = "ჭარბი"
    else: bmi_class = "სიმსუქნე"

    # წყლის ნორმა
    water_ml = round(req.weight_kg * 35)

    # გაფრთხილებები
    warnings = []
    if req.goal == 'lose' and (tdee - target_cal) > 700:
        warnings.append("⚠️ კალორიების დეფიციტი ძალიან დიდია. სისტემა შეამცირა 500-მდე.")
    if req.carb_sensitivity == 'low':
        warnings.append("ℹ️ Low Carb: ნახშირწყლების მინიმუმი 130გ/დღე შენარჩუნებულია ტვინის ფუნქციისთვის.")

    # weekly rate
    if req.goal == 'lose':
        weekly_rate = f"-{round(req.weight_kg * 0.0075, 2)}-{round(req.weight_kg * 0.01, 2)} კგ/კვირა"
    elif req.goal == 'gain':
        weekly_rate = "+0.25-0.5 კგ/კვირა"
    else:
        weekly_rate = "±0.25 კგ/კვირა"

    return {
        "bmr": round(bmr),
        "tdee": round(tdee),
        "adjusted_calories": round(target_cal),
        "bmi": bmi,
        "bmi_class": bmi_class,
        "macros": macros,
        "meals_per_day": len(meals),
        "meal_plan": meals,
        "water_ml": water_ml,
        "timeline": timeline,
        "weekly_rate": weekly_rate,
        "profile_code": profile_code,
        "warnings": warnings,
        "disclaimer": "ეს გათვლა საინფორმაციო ხასიათისაა. ექიმთან კონსულტაციის ჩანაცვლება არ შეუძლია.",
        "calorie_ratio": macros["ratio"],
    }

@router.post("/checkin")
def weekly_checkin(req: CheckinRequest):
    return process_checkin(req)
