#!/usr/bin/env python3
"""Generates the demo identity data for this course project.

Outputs (deterministic, safe to regenerate):
  deploy/keycloak/realm/etkinlik-realm.json  Keycloak realm ("university SSO")
  deploy/demo/seed.sql                       Matching app users + communities

Secrets are NOT written: Keycloak resolves ${OIDC_CLIENT_SECRET},
${DEMO_USER_PASSWORD}, ${INITIAL_ADMIN_EMAIL} and ${APP_ORIGIN} from the
environment when it imports the realm. All people are fictional.

Usage: python tools/demo/generate.py
"""

import json
import random
import unicodedata
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAMESPACE = uuid.UUID("6f1d5c2e-8a3b-4c7d-9e10-2b3c4d5e6f70")
rng = random.Random(20261128)

FIRST = ["Ayşe", "Mehmet", "Zeynep", "Mustafa", "Elif", "Ahmet", "Defne", "Emre", "Selin", "Can",
         "Ece", "Burak", "Deniz", "Kerem", "İrem", "Oğuz", "Melis", "Arda", "Nazlı", "Barış",
         "Esra", "Cem", "Gizem", "Tolga", "Yağmur", "Onur", "Büşra", "Kaan", "Şule", "Umut"]
LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan",
        "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Özdemir", "Polat", "Erdoğan", "Güneş"]
COMMUNITIES = [
    ("Robotik Topluluğu", "Robot yapımı, yarışmalar ve atölyeler."),
    ("Tiyatro Topluluğu", "Sahne çalışmaları ve dönem sonu oyunları."),
    ("Dağcılık ve Doğa Sporları", "Yürüyüş, tırmanış ve kamp etkinlikleri."),
    ("Bilim Kurgu Okuma Grubu", "Aylık kitap tartışmaları ve film gösterimleri."),
    ("Satranç Kulübü", "Turnuvalar ve başlangıç dersleri."),
]


def slug(text: str) -> str:
    table = str.maketrans({"ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g",
                           "ü": "u", "Ü": "u", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c"})
    text = unicodedata.normalize("NFC", text).translate(table).lower()
    return "".join(ch for ch in text if ch.isalnum())


def person(index: int, role: str) -> dict:
    first, last = rng.choice(FIRST), rng.choice(LAST)
    username = f"{slug(first)}.{slug(last)}{index}"
    domain = "ogr.uni.example" if role == "student" else "uni.example"
    entry = {
        "id": str(uuid.uuid5(NAMESPACE, username)),
        "username": username,
        "email": f"{username}@{domain}",
        "firstName": first,
        "lastName": last,
        "role": role,
    }
    if role == "student":
        entry["studentNumber"] = f"2026{index:04d}"
    return entry


people = [person(i, "student") for i in range(1, 31)]
people += [person(100 + i, "advisor") for i in range(1, 6)]
people += [person(200 + i, "admin") for i in range(1, 3)]
students = [p for p in people if p["role"] == "student"]
advisors = [p for p in people if p["role"] == "advisor"]


def kc_user(p: dict) -> dict:
    attributes = {"etkinlik_role": [p["role"]]}
    if "studentNumber" in p:
        attributes["student_number"] = [p["studentNumber"]]
    return {
        "id": p["id"],
        "username": p["username"],
        "email": p["email"],
        "emailVerified": True,
        "firstName": p["firstName"],
        "lastName": p["lastName"],
        "enabled": True,
        "attributes": attributes,
        "credentials": [{"type": "password", "value": "${DEMO_USER_PASSWORD}", "temporary": False}],
    }


def user_profile_config() -> str:
    def text_attr(name, display, required=True):
        attr = {
            "name": name,
            "displayName": display,
            "validations": {"length": {"max": 255}},
            "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
            "multivalued": False,
        }
        if required:
            attr["required"] = {"roles": ["user"]}
        return attr

    config = {
        "attributes": [
            {"name": "username", "displayName": "Kullanıcı adı",
             "validations": {"length": {"min": 3, "max": 255}, "username-prohibited-characters": {}, "up-username-not-idn-homograph": {}},
             "permissions": {"view": ["admin", "user"], "edit": ["admin"]}, "multivalued": False},
            {"name": "email", "displayName": "E-posta",
             "validations": {"email": {}, "length": {"max": 255}},
             "required": {"roles": ["user"]},
             "permissions": {"view": ["admin", "user"], "edit": ["admin"]}, "multivalued": False},
            text_attr("firstName", "Ad"),
            text_attr("lastName", "Soyad"),
            {"name": "etkinlik_role", "displayName": "Rol",
             "validations": {"options": {"options": ["student", "advisor", "admin"]}},
             "permissions": {"view": ["admin"], "edit": ["admin"]}, "multivalued": False},
            {"name": "student_number", "displayName": "Öğrenci numarası",
             "validations": {"pattern": {"pattern": "^[0-9A-Za-z]{4,20}$"}},
             "permissions": {"view": ["admin", "user"], "edit": ["admin"]}, "multivalued": False},
        ],
        "groups": [],
        "unmanagedAttributePolicy": "ADMIN_VIEW",
    }
    return json.dumps(config, ensure_ascii=False)


def mapper(name: str, attribute: str, claim: str) -> dict:
    return {
        "name": name,
        "protocol": "openid-connect",
        "protocolMapper": "oidc-usermodel-attribute-mapper",
        "config": {
            "user.attribute": attribute,
            "claim.name": claim,
            "jsonType.label": "String",
            "id.token.claim": "true",
            "access.token.claim": "false",
            "userinfo.token.claim": "true",
            "introspection.token.claim": "false",
        },
    }


realm = {
    "realm": "etkinlik",
    "displayName": "Üniversite Kimlik Doğrulama (demo)",
    "enabled": True,
    "sslRequired": "external",
    "registrationAllowed": False,
    "resetPasswordAllowed": False,
    "rememberMe": False,
    "loginWithEmailAllowed": True,
    "duplicateEmailsAllowed": False,
    "editUsernameAllowed": False,
    "bruteForceProtected": True,
    "failureFactor": 10,
    "permanentLockout": False,
    "internationalizationEnabled": True,
    "supportedLocales": ["tr", "en"],
    "defaultLocale": "tr",
    "accessTokenLifespan": 300,
    "ssoSessionIdleTimeout": 1800,
    "ssoSessionMaxLifespan": 36000,
    "passwordPolicy": "length(12) and notUsername",
    "clients": [
        {
            "clientId": "etkinlik-web",
            "name": "Etkinlik Platformu",
            "enabled": True,
            "protocol": "openid-connect",
            "publicClient": False,
            "clientAuthenticatorType": "client-secret",
            "secret": "${OIDC_CLIENT_SECRET}",
            "standardFlowEnabled": True,
            "implicitFlowEnabled": False,
            "directAccessGrantsEnabled": False,
            "serviceAccountsEnabled": False,
            "consentRequired": False,
            "frontchannelLogout": False,
            "redirectUris": ["${APP_ORIGIN}/api/v1/auth/callback"],
            "webOrigins": [],
            "attributes": {
                "pkce.code.challenge.method": "S256",
                "post.logout.redirect.uris": "${APP_ORIGIN}/",
            },
            "protocolMappers": [
                mapper("etkinlik_role", "etkinlik_role", "etkinlik_role"),
                mapper("student_number", "student_number", "student_number"),
            ],
            "defaultClientScopes": ["profile", "email"],
            "optionalClientScopes": [],
        }
    ],
    "components": {
        "org.keycloak.userprofile.UserProfileProvider": [
            {
                "providerId": "declarative-user-profile",
                "subComponents": {},
                "config": {"kc.user.profile.config": [user_profile_config()]},
            }
        ]
    },
    "users": [kc_user(p) for p in people] + [
        {
            "id": str(uuid.uuid5(NAMESPACE, "initial-admin")),
            "username": "yonetici",
            "email": "${INITIAL_ADMIN_EMAIL}",
            "emailVerified": True,
            "firstName": "İlk",
            "lastName": "Yönetici",
            "enabled": True,
            "attributes": {"etkinlik_role": ["admin"]},
            "credentials": [{"type": "password", "value": "${DEMO_USER_PASSWORD}", "temporary": False}],
        }
    ],
}

realm_path = ROOT / "deploy/keycloak/realm/etkinlik-realm.json"
realm_path.parent.mkdir(parents=True, exist_ok=True)
realm_path.write_text(json.dumps(realm, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def q(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


lines = [
    "-- Demo data for the course project (generated by tools/demo/generate.py).",
    "-- Fictional people; ids match deploy/keycloak/realm/etkinlik-realm.json.",
    "-- Idempotent: safe to run more than once. The initial admin is NOT seeded here;",
    "-- it is provisioned on first login from INITIAL_ADMIN_EMAIL.",
    "BEGIN;",
]
for p in people:
    number = q(p["studentNumber"]) if "studentNumber" in p else "NULL"
    lines.append(
        "INSERT INTO users (oidc_subject, email, display_name, role, student_number) VALUES "
        f"({q(p['id'])}, {q(p['email'])}, {q(p['firstName'] + ' ' + p['lastName'])}, {q(p['role'])}, {number}) "
        "ON CONFLICT (oidc_subject) DO NOTHING;"
    )
for index, (name, description) in enumerate(COMMUNITIES):
    lines.append(
        f"INSERT INTO communities (name, description) VALUES ({q(name)}, {q(description)}) "
        "ON CONFLICT (name) DO NOTHING;"
    )
    advisor = advisors[index % len(advisors)]
    lines.append(
        "INSERT INTO community_advisors (community_id, advisor_user_id) "
        f"SELECT c.id, u.id FROM communities c, users u WHERE c.name = {q(name)} AND u.oidc_subject = {q(advisor['id'])} "
        "ON CONFLICT DO NOTHING;"
    )
    for member in rng.sample(students, 8):
        lines.append(
            "INSERT INTO community_members (community_id, user_id) "
            f"SELECT c.id, u.id FROM communities c, users u WHERE c.name = {q(name)} AND u.oidc_subject = {q(member['id'])} "
            "ON CONFLICT DO NOTHING;"
        )
lines.append("COMMIT;")

seed_path = ROOT / "deploy/demo/seed.sql"
seed_path.parent.mkdir(parents=True, exist_ok=True)
seed_path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

print(f"{len(people)} demo users, {len(COMMUNITIES)} communities")
print(f"wrote {realm_path.relative_to(ROOT)} and {seed_path.relative_to(ROOT)}")
