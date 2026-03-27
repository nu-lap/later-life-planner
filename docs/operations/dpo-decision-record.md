# DPO Decision Record

Status: completed  
Decision date: 2026-03-25  
Owner: privacy owner (`NxLap Ltd`)
Review cadence: Reassess annually or on material processing-scale changes

## Decision

**A formal Data Protection Officer (DPO) appointment is not currently required** for v1 operations.

## Reasoning

This decision is based on current operating profile and UK GDPR DPO criteria:

1. Core activities:
- current v1 core activity is providing a planning tool, not large-scale special-category profiling

2. Monitoring profile:
- no systematic large-scale monitoring program is part of v1 scope

3. Data categories:
- planner data is sensitive in practice, but v1 design keeps server storage encrypted and minimizes processing scope

4. Organization scale:
- current operational scale and processing model do not meet a mandatory DPO threshold

## Required Controls Despite No Formal DPO

- named privacy owner for governance decisions
- documented DPIA screening and full DPIA gate before production persistence
- documented rights-handling process and incident process
- periodic review of this DPO decision

## Review Cadence and Triggers

Review this decision every 6 months, and immediately if any of these occur:

- significant growth in user base or processing scale
- introduction of high-volume behavioral monitoring
- expansion into higher-risk data processing features
- regulator or legal guidance change affecting DPO thresholds
