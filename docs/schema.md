# Database Schema — COP4331 Decibel Tracker

> **Source of truth**: the Mongoose model files in `server/models/`.
> This document is generated from those schemas and should be kept in sync with them.

## Collections

There are **five** MongoDB collections:

| Collection | Model file |
|---|---|
| `users` | `server/models/User.js` |
| `locationgroups` | `server/models/LocationGroup.js` |
| `studylocations` | `server/models/StudyLocation.js` |
| `reports` | `server/models/Report.js` |
| `reporttagmetadatas` | `server/models/ReportTagMetadata.js` |

---

## Entity-Relationship Diagram

```mermaid
erDiagram
    User {
        string userId PK
        string login
        string email
        string passwordHash
        string firstName
        string lastName
        string displayName
        boolean hideLocation
        string pinColor
        string[] favorites
        float userNoiseWF
        float userOccupancyWF
        string emailVerificationToken
        datetime emailVerifiedAt
        string passwordResetToken
        datetime passwordResetExpiresAt
        datetime passwordChangedAt
        datetime createdAt
        datetime updatedAt
    }

    LocationGroup {
        string locationGroupId PK
        string name
        float centerLatitude
        float centerLongitude
        float radiusMeters
        float currentNoiseLevel
        float currentOccupancyLevel
        datetime updatedAt
        datetime createdAt
    }

    StudyLocation {
        string studyLocationId PK
        string locationGroupId FK
        string name
        string floorLabel
        string sublocationLabel
        float latitude
        float longitude
        float currentNoiseLevel
        float currentOccupancyLevel
        datetime updatedAt
        datetime createdAt
    }

    Report {
        string reportId PK
        string userId FK
        string studyLocationId FK
        float avgNoise
        float maxNoise
        float variance
        int occupancy
        string reportKind
        datetime windowStart
        datetime windowEnd
        datetime createdAt
        datetime updatedAt
    }

    ReportTagMetadata {
        string reportId PK_FK
        float decayFactor
        float varianceCorrectionWF
        float sessionCorrectionNoiseWF
        float noiseWeightFactor
        float occupancyWeightFactor
        datetime lastEvaluatedAt
        datetime createdAt
        datetime updatedAt
    }

    LocationGroup ||--o{ StudyLocation : "contains"
    StudyLocation ||--o{ Report : "receives"
    User ||--o{ Report : "submits"
    Report ||--|| ReportTagMetadata : "has"
```

---

## Field Reference

### User

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `userId` | String | Yes | — | PK — UUID assigned at registration |
| `login` | String | Yes | — | Unique, lowercase |
| `email` | String | Yes | — | Unique, lowercase |
| `passwordHash` | String | Yes | — | bcrypt hash |
| `firstName` | String | No | `null` | Optional |
| `lastName` | String | No | `null` | Optional |
| `displayName` | String | No | `null` | Optional |
| `hideLocation` | Boolean | Yes | `false` | Controls location visibility |
| `pinColor` | String | No | `"#0F766E"` | Hex colour |
| `favorites` | String[] | No | `[]` | Array of `studyLocationId` values |
| `userNoiseWF` | Number | Yes | `1` | Personal noise weight factor, min `0` |
| `userOccupancyWF` | Number | Yes | `1` | Personal occupancy weight factor, min `0` |
| `emailVerificationToken` | String | No | `null` | Indexed; null after verification |
| `emailVerifiedAt` | Date | No | `null` | Null until verified |
| `passwordResetToken` | String | No | `null` | Indexed; null when no reset pending |
| `passwordResetExpiresAt` | Date | No | `null` | Null when no reset pending |
| `passwordChangedAt` | Date | No | `Date.now` | Set on creation and password change |
| `createdAt` | Date | Auto | — | Mongoose `timestamps: true` |
| `updatedAt` | Date | Auto | — | Mongoose `timestamps: true` |

**Relationship**: `User` → `Report` is **unidirectional**. Reports store `userId`; the `User` document has no list of report IDs.

**Instance methods**: `getProfile()`, `updateProfile(updates)`, `verifyEmail()`

---

### LocationGroup

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `locationGroupId` | String | Yes | — | PK — slug style (e.g. `group-john-c-hitt-library`) |
| `name` | String | Yes | — | Human-readable building name |
| `centerLatitude` | Number | No | `null` | Decimal degrees, −90 to 90. **Null for catalog-seeded groups** (catalog does not supply coordinates at the group level). |
| `centerLongitude` | Number | No | `null` | Decimal degrees, −180 to 180. Null for catalog-seeded groups. |
| `radiusMeters` | Number | No | `null` | Boundary radius, min `1`. Null for catalog-seeded groups. |
| `currentNoiseLevel` | Number | No | `null` | Weighted average across member locations, min `0` |
| `currentOccupancyLevel` | Number | No | `null` | Weighted average, `1`–`5` |
| `updatedAt` | Date | No | `null` | **Manually managed** — set by the A1 polling cycle. Mongoose `timestamps.updatedAt` is **disabled** for this model. |
| `createdAt` | Date | Auto | — | Mongoose `timestamps: { createdAt: true, updatedAt: false }` |

---

### StudyLocation

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `studyLocationId` | String | Yes | — | PK — slug style (e.g. `library-floor-1-quiet`) |
| `locationGroupId` | String | Yes | — | FK → `LocationGroup.locationGroupId` |
| `name` | String | Yes | — | Short descriptive name |
| `floorLabel` | String | No | `""` | e.g. `"Floor 1"`. **Note**: catalog entries carry this value but `#ensureCatalogLocation` does not write it on auto-creation — auto-created documents get `""` instead. See Design Observations. |
| `sublocationLabel` | String | No | `""` | e.g. `"North Reading Room"`. Same catalog-seeding gap as `floorLabel`. |
| `latitude` | Number | Yes | — | Decimal degrees, −90 to 90 |
| `longitude` | Number | Yes | — | Decimal degrees, −180 to 180 |
| `currentNoiseLevel` | Number | No | `null` | Live weighted average (dB), min `0` |
| `currentOccupancyLevel` | Number | No | `null` | Live weighted average, `1`–`5` |
| `updatedAt` | Date | No | `null` | **Manually managed** — set by A1 polling cycle. Mongoose `timestamps.updatedAt` **disabled**. |
| `createdAt` | Date | Auto | — | Mongoose `timestamps: { createdAt: true, updatedAt: false }` |

**Compound indexes**: `{ locationGroupId, name }`, `{ latitude, longitude }`

---

### Report

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `reportId` | String | Yes | — | PK — `crypto.randomUUID()` |
| `userId` | String | **Conditionally** | `null` | FK → `User.userId`. Required when `reportKind = "live"`. **Null for `archive_summary` documents** and for anonymous (`"local-user"`) reports. |
| `studyLocationId` | String | Yes | — | FK → `StudyLocation.studyLocationId` |
| `createdAt` | Date | Yes | — | **Manually required** — explicitly defined in schema; supplied by the caller (can be back-dated). Not auto-managed by Mongoose timestamps. |
| `avgNoise` | Number | Yes | — | Average dB reading from session, min `0` |
| `maxNoise` | Number | **Conditionally** | `null` | Peak dB reading. Required when `reportKind = "live"`. **Null for `archive_summary`**. |
| `variance` | Number | **Conditionally** | `null` | Noise variance. Required when `reportKind = "live"`. **Null for `archive_summary`**. |
| `occupancy` | Number | Yes | — | User-reported occupancy, `1`–`5` |
| `reportKind` | String | No | `"live"` | Enum: `"live"` \| `"archive_summary"`. Drives archival lifecycle and conditional validation. |
| `windowStart` | Date | **Conditionally** | `null` | Start of archival window. Required when `reportKind = "archive_summary"`. |
| `windowEnd` | Date | **Conditionally** | `null` | End of archival window. Required when `reportKind = "archive_summary"`. |
| `updatedAt` | Date | Auto | — | Mongoose `timestamps: true` |

**Compound indexes**:
- `{ studyLocationId: 1, createdAt: -1 }` — location timeline queries
- `{ studyLocationId: 1, reportKind: 1, windowStart: 1 }` — archive window queries
- `{ userId: 1, createdAt: -1 }` — per-user report history

`reportKind` drives the A1 polling / archival cycle:
- `"live"` — recent reading, included in weighted noise/occupancy averages
- `"archive_summary"` — produced by the polling loop; aggregates a window of stale live reports; `userId`, `maxNoise`, and `variance` are explicitly set to `null` on creation

---

### ReportTagMetadata

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `reportId` | String | Yes | — | PK and FK → `Report.reportId` (1-to-1) |
| `decayFactor` | Number | Yes | — | Time-decay weight, min `0` |
| `varianceCorrectionWF` | Number | Yes | — | Penalty for high noise variance, min `0` |
| `sessionCorrectionNoiseWF` | Number | Yes | — | Session-level noise correction, min `0` |
| `noiseWeightFactor` | Number | Yes | — | Final composite weight for noise contribution, min `0` |
| `occupancyWeightFactor` | Number | Yes | — | Final composite weight for occupancy contribution, min `0` |
| `lastEvaluatedAt` | Date | Yes | — | Timestamp of the last A1 polling cycle that updated this record |
| `createdAt` | Date | Auto | — | Mongoose `timestamps: true` |
| `updatedAt` | Date | Auto | — | Mongoose `timestamps: true` |

**Why a separate collection?**
Weight factors are re-evaluated on every A1 polling cycle independently of the report's core data. Keeping them in a dedicated collection allows the polling service to `bulkWrite` metadata without touching immutable `Report` documents, and allows the two concerns to be queried independently.

`ReportTagMetadata` is a **full entity** in the schema — its own model, its own collection, managed by a separate code path (the A1 service). It is not an embedded sub-document.

---

## Relationships Summary

| Relationship | Cardinality | Join field |
|---|---|---|
| `LocationGroup` → `StudyLocation` | One-to-many | `StudyLocation.locationGroupId` |
| `StudyLocation` → `Report` | One-to-many | `Report.studyLocationId` |
| `User` → `Report` | One-to-many (unidirectional) | `Report.userId` |
| `Report` → `ReportTagMetadata` | One-to-one | `ReportTagMetadata.reportId` |

All foreign keys are **strings**, not MongoDB `ObjectId` references. Cross-collection joins are performed in application code, not via MongoDB `$lookup`.

---

## Notes on ID Conventions

All primary keys use human-readable or UUID string identifiers:

- `userId` — UUID (`crypto.randomUUID()`)
- `reportId` — UUID (`crypto.randomUUID()`)
- `studyLocationId` — slug (e.g. `library-floor-1-quiet`)
- `locationGroupId` — slug (e.g. `group-john-c-hitt-library`)
- `ReportTagMetadata.reportId` — mirrors its parent `Report.reportId`

MongoDB's auto-generated `_id` (ObjectId) field is present on every document as usual but is not used for application-level references.

---

## Timestamps Behaviour Summary

| Model | `createdAt` source | `updatedAt` source |
|---|---|---|
| `User` | Mongoose `timestamps: true` | Mongoose `timestamps: true` |
| `Report` | **Explicit field** (`required: true`) — back-dateable by caller | Mongoose `timestamps: true` |
| `ReportTagMetadata` | Mongoose `timestamps: true` | Mongoose `timestamps: true` |
| `StudyLocation` | Mongoose `timestamps: { createdAt: true, updatedAt: false }` | **Explicit field** (`default: null`) — set by A1 polling cycle |
| `LocationGroup` | Mongoose `timestamps: { createdAt: true, updatedAt: false }` | **Explicit field** (`default: null`) — set by A1 polling cycle |

---

## Catalog Seeding

`server/services/locationCatalog.js` defines 6 hard-coded study locations across 3 location groups (UCF campus). These are auto-created in the database on first report submission via `#ensureCatalogLocation` in `ReportProcessingService`.

**Known seeding gap**: the catalog includes `floorLabel` and `sublocationLabel` for all 6 locations, but `#ensureCatalogLocation` does not write these fields during auto-creation. Auto-created `StudyLocation` documents receive the Mongoose default (`""`). The values can only be set via the location management API.

Auto-created `LocationGroup` documents receive `centerLatitude`, `centerLongitude`, and `radiusMeters` as `null` (model defaults), because the catalog does not carry group-level coordinates.
