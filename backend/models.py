from sqlalchemy import Column, Integer, String
from database import Base

class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    fio = Column(String)
    login = Column(String)
    system = Column(String)
    days = Column(Integer)
    emp_type = Column(String)
    last_date = Column(String) # <--- НОВОЕ ПОЛЕ ДЛЯ ДАТЫ

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    fio_key = Column(String, index=True)
    emp_type = Column(String)

class Exclusion(Base):
    __tablename__ = "exclusions"
    id = Column(Integer, primary_key=True, index=True)
    fio_key = Column(String, index=True)