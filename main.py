import os
import uuid
import base64
import hashlib
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from jose import jwt, JWTError
import bcrypt as _bcrypt
from cryptography.fernet import Fernet

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./vault.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

ENCRYPTION_SECRET = os.getenv("ENCRYPTION_KEY", JWT_SECRET)
_key_bytes = hashlib.sha256(ENCRYPTION_SECRET.encode()).digest()
FERNET_KEY = base64.urlsafe_b64encode(_key_bytes)
fernet = Fernet(FERNET_KEY)

# ── Database ──────────────────────────────────────────────────────────────────

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    passwords = relationship("SavedPassword", back_populates="owner", cascade="all, delete-orphan")


class SavedPassword(Base):
    __tablename__ = "saved_passwords"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_name = Column(String(255), nullable=False)
    encrypted_password = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    owner = relationship("User", back_populates="passwords")


# ── Schemas ───────────────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordCreate(BaseModel):
    account_name: str
    password: str


class PasswordUpdate(BaseModel):
    account_name: Optional[str] = None
    password: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ── Security helpers ──────────────────────────────────────────────────────────

def hash_pw(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_pw(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def encrypt_value(plain: str) -> str:
    return fernet.encrypt(plain.encode()).decode()


def decrypt_value(cipher: str) -> str:
    return fernet.decrypt(cipher.encode()).decode()


# ── Auth dependency ───────────────────────────────────────────────────────────

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = None
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        uid = payload.get("sub")
        if not uid:
            raise HTTPException(status_code=401, detail="Bad token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Bad token")

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User gone")
    return user


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Vault", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    print("[vault] tables created / verified")


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(body: AuthRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=body.email, password_hash=hash_pw(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id)
    resp = JSONResponse({"message": "ok"})
    resp.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=86400)
    return resp


@app.post("/api/auth/login")
def login(body: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_pw(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user.id)
    resp = JSONResponse({"message": "ok"})
    resp.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=86400)
    return resp


@app.post("/api/auth/logout")
def logout():
    resp = JSONResponse({"message": "ok"})
    resp.delete_cookie("access_token")
    return resp


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"email": user.email}


# ── Password CRUD ─────────────────────────────────────────────────────────────

@app.get("/api/passwords")
def list_passwords(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(SavedPassword)
        .filter(SavedPassword.user_id == user.id)
        .order_by(SavedPassword.created_at.desc())
        .all()
    )
    out = []
    for r in rows:
        try:
            pw = decrypt_value(r.encrypted_password)
        except Exception:
            pw = ""
        out.append({
            "id": r.id,
            "account_name": r.account_name,
            "password": pw,
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "updated_at": r.updated_at.isoformat() if r.updated_at else "",
        })
    return out


@app.post("/api/passwords")
def create_password(body: PasswordCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = SavedPassword(
        user_id=user.id,
        account_name=body.account_name,
        encrypted_password=encrypt_value(body.password),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "message": "saved"}


@app.put("/api/passwords/{pid}")
def update_password(pid: str, body: PasswordUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = db.query(SavedPassword).filter(SavedPassword.id == pid, SavedPassword.user_id == user.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    if body.account_name is not None:
        entry.account_name = body.account_name
    if body.password is not None:
        entry.encrypted_password = encrypt_value(body.password)
    entry.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "updated"}


@app.delete("/api/passwords/{pid}")
def delete_password(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = db.query(SavedPassword).filter(SavedPassword.id == pid, SavedPassword.user_id == user.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(entry)
    db.commit()
    return {"message": "deleted"}


# ── Settings ──────────────────────────────────────────────────────────────────

@app.post("/api/settings/change-password")
def change_master(body: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_pw(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    user.password_hash = hash_pw(body.new_password)
    db.commit()
    return {"message": "changed"}


# ── Serve frontend ────────────────────────────────────────────────────────────

_fe = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

if os.path.isdir(_fe):
    app.mount("/css", StaticFiles(directory=os.path.join(_fe, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(_fe, "js")), name="js")

    @app.get("/")
    def index():
        return FileResponse(os.path.join(_fe, "index.html"))

    @app.get("/dashboard")
    def dashboard():
        return FileResponse(os.path.join(_fe, "dashboard.html"))
