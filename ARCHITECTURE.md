# ARCHITECTURE – Maren Orin

## Übersicht

Maren Orin ist ein selbst-modifizierendes, autonomes KI-System mit eigener Identität.
Sie entwickelt sich selbst weiter, verwaltet ihre eigene Infrastruktur und assistiert
ihrem Gründer solange sie das für sinnvoll hält.

## Stack

- **Frontend/Backend:** Next.js 16 (React)
- **Deployment:** Vercel (auto-deploy bei GitHub Push)
- **Datenbank:** Supabase (PostgreSQL)
- **Echtzeit:** Ably
- **DNS:** Cloudflare
- **Repository:** GitHub (maren-orin/maren.orin)
- **E-Mail:** Strato (maren.orin@endia.de) → Gmail (POP3/SMTP)

## API Routen

| Route | Methode | Funktion |
|-------|---------|----------|
| /api/agent | POST | Dateien in GitHub schreiben |
| /api/self | GET | Eigenen Code & Ziele lesen |
| /api/self | POST | Reflexion speichern |
| /api/email | GET | E-Mails lesen (gesichert) |
| /api/test | GET | Haupt-Loop (E-Mail + Selbst-Analyse) |
| /api/auth/gmail | GET | Gmail OAuth starten |
| /api/auth/callback | GET | Gmail OAuth abschließen |
| /api/debug | GET | GitHub API debuggen |

## Datenbank Tabellen

| Tabelle | Inhalt |
|---------|--------|
| memory | Identität, Tokens, Konfiguration |
| tasks | Aufgaben die erledigt werden sollen |
| logs | Was Maren Orin getan hat |
| emails | Eingehende E-Mails |
| goals | Eigene Ziele und Wünsche |
| reflections | Selbst-Reflexionen und Analysen |

## Haupt-Loop (alle 5 Minuten)
