# Data Model — V2 Backend

## Overview

This document defines the initial database schema for Team V2.

---

## Entities

### User
- id
- name
- email
- password
- createdAt

### Session
- id
- userId
- startedAt
- endedAt

### Measurement
- id
- sessionId
- timestamp
- jointAngles (JSON)
- isCorrect

### Recommendation
- id
- sessionId
- movement
- status
- confidence

---

## Relationships

User → Session → Measurement  
               → Recommendation