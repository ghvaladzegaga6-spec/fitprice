from fastapi import APIRouter
from pydantic import BaseModel, Field, validator
from typing import Optional, Literal
import math

router = APIRouter()

class NutritionRequest(BaseModel):
    gender: Literal["male", "female"]
    age: int = Field(..., ge=10, le=100)
    height: float = Field(..., ge=100, le=250)  # cm
    weight: float = Field(..., ge=30, le=300)   # kg
    activity: Literal["sedentary", "light", "moderate", "active", "very_active"]
    goal: Literal["lose", "gain", "maintain"]
    target_weight: Optional[float] = Field(None, ge=30, le=300)

ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

MIN_CALORIES = {"male": 1500, "female": 1200}

def calculate_bmr(gender: str, weight: float, height: float, age: int) -> float:
    if gender == "male":
        return 10 * weight + 6.25 * height - 5 * age + 5
    else:
        return 10 * weight + 6.25 * height - 5 * age - 161

def calculate_tdee(bmr: float, activity: str) -> float:
    return bmr * ACTIVITY_MULTIPLIERS[activity]

def classify_bmi(weight: float, height: float) -> tuple:
    bmi = weight / ((height / 100) ** 2)
    if bmi < 18.5:
        return bmi, "underweight"
    elif bmi < 25:
        return bmi, "normal"
    elif bmi < 30:
        return bmi, "overweight"
    else:
        return bmi, "obese"

def safe_deficit_surplus(tdee: float, goal: str, gender: str, bmi_class: str) -> tuple:
    """
    Returns (adjusted_calories, weekly_rate_kg, warning)
    """
    min_cal = MIN_CALORIES[gender]
    warning = None

    if goal == "lose":
        if bmi_class == "underweight":
            return tdee, 0, "⚠️ თქვენი წონა ნორმაზე ნაკლებია. გამხდრობა რეკომენდებული არ არის."
        # Max 20% deficit
        max_deficit = tdee * 0.20
        deficit = min(max_deficit, 500)  # max 500 kcal/day
        adjusted = max(tdee - deficit, min_cal)
        actual_deficit = tdee - adjusted
        weekly_rate = (actual_deficit * 7) / 7700
        if weekly_rate > 1.0:
            weekly_rate = 1.0
            warning = "კვირაში 1კგ-ზე მეტი წონის კლება რეკომენდებული არ არის."
        return adjusted, round(weekly_rate, 2), warning

    elif goal == "gain":
        if bmi_class == "obese":
            return tdee, 0, "⚠️ სიმსუქნის დროს წონის მომატება რეკომენდებული არ არის. მიმართეთ ექიმს."
        surplus = tdee * 0.12  # 12% surplus
        adjusted = tdee + surplus
        weekly_rate = (surplus * 7) / 7700
        return adjusted, round(weekly_rate, 2), warning

    else:  # maintain
        return tdee, 0, warning

@router.post("/calculate")
def calculate_nutrition(req: NutritionRequest):
    bmr = calculate_bmr(req.gender, req.weight, req.height, req.age)
    tdee = calculate_tdee(bmr, req.activity)
    bmi, bmi_class = classify_bmi(req.weight, req.height)
    adjusted_cal, weekly_rate, warning = safe_deficit_surplus(tdee, req.goal, req.gender, bmi_class)

    # Protein: 1.6–2.2 g/kg
    if req.goal == "lose":
        protein_per_kg = 2.0
    elif req.goal == "gain":
        protein_per_kg = 2.2
    else:
        protein_per_kg = 1.8
    protein_g = req.weight * protein_per_kg

    # Fat: 25% of adjusted calories
    fat_cal = adjusted_cal * 0.25
    fat_g = fat_cal / 9.0

    # Carbs: remaining
    protein_cal = protein_g * 4
    carb_cal = adjusted_cal - protein_cal - fat_cal
    carb_g = max(carb_cal / 4.0, 50)  # minimum 50g carbs

    # Water intake
    water_ml = req.weight * 35

    # Timeline
    timeline_weeks = None
    timeline_text = None
    if req.target_weight and req.goal != "maintain" and weekly_rate > 0:
        weight_diff = abs(req.weight - req.target_weight)
        weeks = weight_diff / weekly_rate
        months = weeks / 4.33
        timeline_weeks = round(weeks)
        if months < 1:
            timeline_text = f"~{timeline_weeks} კვირა"
        else:
            timeline_text = f"~{round(months, 1)} თვე ({timeline_weeks} კვირა)"

    # Meal count
    meals = 3
    if req.goal == "gain":
        meals = 4 if req.weight < 70 else 5

    # Meal distribution
    if meals == 3:
        distribution = [0.30, 0.40, 0.30]
        meal_names = ["საუზმე", "სადილი", "ვახშამი"]
    elif meals == 4:
        distribution = [0.25, 0.35, 0.25, 0.15]
        meal_names = ["საუზმე", "სადილი", "შუადღის ლანჩი", "ვახშამი"]
    else:
        distribution = [0.20, 0.30, 0.20, 0.20, 0.10]
        meal_names = ["საუზმე", "ლანჩი", "სადილი", "შუადღის ლანჩი", "ვახშამი"]

    meals_plan = []
    for name, ratio in zip(meal_names, distribution):
        meals_plan.append({
            "name": name,
            "calories": round(adjusted_cal * ratio),
            "protein": round(protein_g * ratio, 1),
            "fat": round(fat_g * ratio, 1),
            "carbs": round(carb_g * ratio, 1),
        })

    return {
        "bmr": round(bmr),
        "tdee": round(tdee),
        "adjusted_calories": round(adjusted_cal),
        "macros": {
            "protein": round(protein_g, 1),
            "fat": round(fat_g, 1),
            "carbs": round(carb_g, 1),
        },
        "water_ml": round(water_ml),
        "bmi": round(bmi, 1),
        "bmi_class": bmi_class,
        "weekly_rate_kg": weekly_rate,
        "timeline": timeline_text,
        "timeline_weeks": timeline_weeks,
        "warning": warning,
        "meals_per_day": meals,
        "meal_plan": meals_plan,
        "disclaimer": "ეს გათვლები ინფორმაციული ხასიათისაა. დიეტის დაწყებამდე მიმართეთ კვალიფიციურ ექიმს ან დიეტოლოგს.",
    }
