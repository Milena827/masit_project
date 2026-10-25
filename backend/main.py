from fastapi import FastAPI, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import pandas as pd
from io import BytesIO
import re
from rapidfuzz import process, fuzz

import models
from database import engine, SessionLocal

models.Base.metadata.create_all(bind=engine)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def normalize_fio(value):
    if not value or pd.isna(value): return ""
    text = str(value).strip().split(",")[0].lower().replace("ё", "е")
    return re.sub(r"\s+", " ", text)

@app.post("/api/upload-shr")
async def upload_shr(file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()
    df = pd.read_excel(BytesIO(contents))
    db.query(models.Employee).delete()
    for _, row in df.iterrows():
        fio = row.get("Табельный номер")
        level = str(row.get("Уровень оргструктуры 1 (текст)", ""))
        if not fio: continue
        emp_type = "Не определён"
        if level == "Аппарат управления": emp_type = "Офисный"
        elif level == "Производственный персонал": emp_type = "Вахтовый"
        db.add(models.Employee(fio_key=normalize_fio(fio), emp_type=emp_type))
    db.commit()
    return {"status": "ok", "count": len(df)}

@app.post("/api/upload-exclusions")
async def upload_exclusions(file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()
    df = pd.read_excel(BytesIO(contents))
    db.query(models.Exclusion).delete()
    for _, row in df.iterrows():
        fio = row.get("ФИО")
        if fio: db.add(models.Exclusion(fio_key=normalize_fio(fio)))
    db.commit()
    return {"status": "ok"}

@app.post("/api/upload-kitc")
async def upload_kitc(file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()
    df = pd.read_excel(BytesIO(contents), header=0, skiprows=[1, 2])
    df.columns = df.columns.str.replace("\n", " ").str.replace(r"\s+", " ", regex=True).str.strip()
    
    shr_db = db.query(models.Employee).all()
    shr_list = [e.fio_key for e in shr_db]
    shr_map = {e.fio_key: e.emp_type for e in shr_db}
    
    date_col = next(c for c in df.columns if "Дата последней авторизации пользователя в системе" in c)
    fio_col = next(c for c in df.columns if "ФИО пользователя" in c)
    login_col = next(c for c in df.columns if "Логин пользователя" in c)
    sys_col = next(c for c in df.columns if "Наименование информационной системы" in c)
    do_col = next(c for c in df.columns if "Наименование ДО единицы обслуживания" in c)
    
    df[date_col] = pd.to_datetime(df[date_col], dayfirst=True, errors="coerce").dt.date
    today = pd.to_datetime("today").date()
    
    db.query(models.Account).delete()
    added = 0
    
    for _, row in df.iterrows():
        if not str(row[do_col]).strip().endswith("Заполярье"): continue
        
        fio = row[fio_col]
        if pd.isna(fio) or len(str(fio).split()) < 2: continue
        
        norm_fio = normalize_fio(fio)
        match = process.extractOne(norm_fio, shr_list, scorer=fuzz.ratio)
        if not match or match[1] < 80: continue
        
        emp_type = shr_map.get(match[0])
        if not emp_type or emp_type == "Не определён": continue
        
        last_date = row[date_col]
        
        # СОХРАНЯЕМ ВСЕХ!
        if pd.isna(last_date):
            days = 0
            date_str = "-"
        else:
            days = (today - last_date).days
            date_str = last_date.strftime("%d.%m.%Y")
            
        if isinstance(days, int) and days >= 0:
            db.add(models.Account(
                fio=str(fio), 
                login=str(row[login_col]) if not pd.isna(row[login_col]) else "-", 
                system=str(row[sys_col]), 
                days=days, 
                emp_type=emp_type,
                last_date=date_str # Сохраняем дату (или прочерк)
            ))
            added += 1
                
    db.commit()
    return {"status": "ok", "added": added}

@app.post("/api/search-fio")
async def search_fio(data: dict, db: Session = Depends(get_db)):
    fio_query = data.get("query", "")
    if not fio_query: return {"results": []}
    
    fio_list = [normalize_fio(f) for f in fio_query.split(",") if f.strip()]
    all_results = []
    
    all_accounts = db.query(models.Account).all()
    all_shr = db.query(models.Employee).all()
    shr_keys = [s.fio_key for s in all_shr]

    for fio in fio_list:
        found_someone = False
        
        matches = process.extract(fio, [normalize_fio(a.fio) for a in all_accounts], scorer=fuzz.ratio, limit=None)
        good_matches = [m for m in matches if m[1] >= 80]
        
        if good_matches:
            found_someone = True
            best_score = good_matches[0][1]
            best_keys = [m[0] for m in good_matches if m[1] == best_score]
            
            for acc in all_accounts:
                if normalize_fio(acc.fio) in best_keys:
                    all_results.append({
                        "fio": acc.fio, 
                        "login": acc.login, 
                        "system": acc.system,
                        "last_date": acc.last_date, # <--- ОТДАЕМ ДАТУ В ЧАТ
                        "type": acc.emp_type
                    })

        if not found_someone:
            shr_matches = process.extract(fio, shr_keys, scorer=fuzz.ratio, limit=None)
            good_shr = [m for m in shr_matches if m[1] >= 80]
            
            if good_shr:
                best_score = good_shr[0][1]
                best_keys = [m[0] for m in good_shr if m[1] == best_score]
                found_shr = next((s for s in all_shr if s.fio_key in best_keys), None)
                if found_shr:
                    all_results.append({
                        "fio": f"В ШР найден: {found_shr.fio_key.capitalize()}",
                        "login": "Нет в КИТС", 
                        "system": "Нет в КИТС",
                        "last_date": "-", 
                        "type": found_shr.emp_type
                    })
            else:
                all_results.append({
                    "fio": f"Не найден: {fio}",
                    "login": "-", "system": "-",
                    "last_date": "-", "type": "-"
                })
                
    return {"results": all_results}

@app.get("/api/accounts")
async def get_accounts(db: Session = Depends(get_db)):
    return db.query(models.Account).all()