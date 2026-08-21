# FieldAgentLog - user guide

FieldAgentLog is the mobile app for fire-safety checks and site attendance across a property
portfolio. It records inspections against each building's fire logbook, tracks cleaners'
time on site, and lets anyone raise a report about something wrong with a building.

It is built for the real conditions of this work: **everything works without signal**. Answers,
photos, check-ins and reports are saved on the phone the moment you make them and sent to the
server automatically when the phone next has a connection. Nothing you capture is ever lost to
a dead spot, a closed app or a flat battery mid-task.

## The two ways in

There are two separate front doors, and which one you use decides what you see:

1. **A visit link** - no account needed. Someone sends you a link (or a code) for one specific
   inspection at one building. Opening it starts the inspection wizard. When you finish, you're
   done - there is nothing else to see. See [inspector.md](inspector.md).
2. **Signing in** - an email and password for people who work with these buildings regularly.
   What you see after signing in depends on your role (below).

## The three roles

Your role is decided by your account on the server, not by anything you choose in the app:

| Role | Home screen | What you can do |
| --- | --- | --- |
| **Staff** | "Your blocks" - every block in your organisation | Everything an agent can, plus start a checklist on any block yourself and use Plan visits |
| **Field agent** | "Your visits" - only the blocks assigned to you | See assigned blocks, their history, start checklists, raise reports |
| **Cleaner** | "Site visits" - your company's sites | Check in and out of sites, run due fire checks while there, raise reports |

If the app cannot work out your role (usually a first sign-in with no signal), it says so and
offers a retry - it never guesses, because guessing could show you the wrong buildings.

## The guide

| Read | If you |
| --- | --- |
| [inspector.md](inspector.md) | Were sent a visit link, or want to understand the inspection wizard everyone shares |
| [field-agent.md](field-agent.md) | Sign in as a field agent |
| [staff.md](staff.md) | Sign in as staff |
| [cleaner.md](cleaner.md) | Sign in as a cleaner |
| [reports.md](reports.md) | Want to report a problem with a building (any role) |
| [offline.md](offline.md) | Want to understand what "waiting to send", "needs attention" and the badges mean |
| [settings-and-help.md](settings-and-help.md) | Need the menu, About, Diagnostics, permissions or troubleshooting |

One more thing shared by everyone: the inspection wizard opened from a link and the one opened
from inside the app are the same wizard. Learn it once and you know it everywhere.
