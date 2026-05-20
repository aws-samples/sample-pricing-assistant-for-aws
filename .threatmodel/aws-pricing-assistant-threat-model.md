# Comprehensive Threat Model Report

**Generated**: 2026-05-15 20:37:54
**Current Phase**: 1 - Business Context Analysis
**Overall Completion**: 100.0%

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Business Context](#business-context)
3. [System Architecture](#system-architecture)
4. [Threat Actors](#threat-actors)
5. [Trust Boundaries](#trust-boundaries)
6. [Assets and Flows](#assets-and-flows)
7. [Threats](#threats)
8. [Mitigations](#mitigations)
9. [Assumptions](#assumptions)
10. [Phase Progress](#phase-progress)

## Executive Summary

AWS Pricing Assistant: a public-facing AI chatbot reference implementation that helps customers estimate AWS service costs and Savings Plans. Bedrock Converse API (Claude Opus 4.6 / Sonnet 4.5 via cross-region inference) drives a tool-using agent backed by AWS Pricing API and Savings Plans API. Frontend (nginx/React) and Backend (Node.js/Express+WebSocket) run as ECS Fargate services in private subnets behind an internal ALB locked to the CloudFront prefix list. CloudFront+WAF (us-east-1) front the public domain. Defense-in-depth: WAF rate limits, Express limiters, per-WS chat caps, 100-client WS cap, Bedrock Guardrails, and an AWS Budget hard cap with auto-deny policy. No PII stored; conversation history is in-memory only; uploaded infrastructure files (CFN/Terraform/CDK) live in S3 with a 7-day lifecycle. Optional Cognito auth toggled by an AuthEnabled CFN flag — when on: admin-managed users, FIDO2 passkeys (NIST AAL2), optional/mandatory TOTP MFA, JWT validation on REST and WebSocket. A reference deployment is available at the configured domain (us-west-2). Deployed via 10 CFN stacks under GitOps CodePipeline.

### Key Statistics

- **Total Threats**: 10
- **Total Mitigations**: 10
- **Total Assumptions**: 9
- **System Components**: 0
- **Assets**: 8
- **Threat Actors**: 11

## Business Context

**Description**: AWS Pricing Assistant: a public-facing AI chatbot reference implementation that helps customers estimate AWS service costs and Savings Plans. Bedrock Converse API (Claude Opus 4.6 / Sonnet 4.5 via cross-region inference) drives a tool-using agent backed by AWS Pricing API and Savings Plans API. Frontend (nginx/React) and Backend (Node.js/Express+WebSocket) run as ECS Fargate services in private subnets behind an internal ALB locked to the CloudFront prefix list. CloudFront+WAF (us-east-1) front the public domain. Defense-in-depth: WAF rate limits, Express limiters, per-WS chat caps, 100-client WS cap, Bedrock Guardrails, and an AWS Budget hard cap with auto-deny policy. No PII stored; conversation history is in-memory only; uploaded infrastructure files (CFN/Terraform/CDK) live in S3 with a 7-day lifecycle. Optional Cognito auth toggled by an AuthEnabled CFN flag — when on: admin-managed users, FIDO2 passkeys (NIST AAL2), optional/mandatory TOTP MFA, JWT validation on REST and WebSocket. A reference deployment is available at the configured domain (us-west-2). Deployed via 10 CFN stacks under GitOps CodePipeline.

### Business Features

- **Industry Sector**: Technology
- **Data Sensitivity**: Public
- **User Base Size**: Small
- **Geographic Scope**: Global
- **Regulatory Requirements**: None
- **System Criticality**: Low
- **Financial Impact**: Medium
- **Authentication Requirement**: MFA
- **Deployment Environment**: Cloud-Public
- **Integration Complexity**: Moderate

## System Architecture

## Threat Actors

### Insider

- **Type**: Insider
- **Capability Level**: Medium
- **Motivations**: Financial, Revenge
- **Resources**: Limited
- **Relevant**: Yes
- **Priority**: 6/10
- **Description**: An employee or contractor with legitimate access to the system

### External Attacker

- **Type**: External
- **Capability Level**: Medium
- **Motivations**: Financial
- **Resources**: Moderate
- **Relevant**: Yes
- **Priority**: 1/10
- **Description**: An external individual or group attempting to gain unauthorized access

### Nation-state Actor

- **Type**: Nation-state
- **Capability Level**: High
- **Motivations**: Espionage, Political
- **Resources**: Extensive
- **Relevant**: No
- **Priority**: 1/10
- **Description**: A government-sponsored group with advanced capabilities

### Hacktivist

- **Type**: Hacktivist
- **Capability Level**: Medium
- **Motivations**: Ideology, Political
- **Resources**: Moderate
- **Relevant**: No
- **Priority**: 6/10
- **Description**: An individual or group motivated by ideological or political beliefs

### Organized Crime

- **Type**: Organized Crime
- **Capability Level**: High
- **Motivations**: Financial
- **Resources**: Extensive
- **Relevant**: Yes
- **Priority**: 3/10
- **Description**: A criminal organization with significant resources

### Competitor

- **Type**: Competitor
- **Capability Level**: Medium
- **Motivations**: Financial, Espionage
- **Resources**: Moderate
- **Relevant**: No
- **Priority**: 7/10
- **Description**: A business competitor seeking competitive advantage

### Script Kiddie

- **Type**: Script Kiddie
- **Capability Level**: Low
- **Motivations**: Curiosity, Reputation
- **Resources**: Limited
- **Relevant**: Yes
- **Priority**: 2/10
- **Description**: An inexperienced attacker using pre-made tools

### Disgruntled Employee

- **Type**: Disgruntled Employee
- **Capability Level**: Medium
- **Motivations**: Revenge
- **Resources**: Limited
- **Relevant**: Yes
- **Priority**: 7/10
- **Description**: A current or former employee with a grievance

### Privileged User

- **Type**: Privileged User
- **Capability Level**: High
- **Motivations**: Financial, Accidental
- **Resources**: Moderate
- **Relevant**: Yes
- **Priority**: 4/10
- **Description**: A user with elevated privileges who may abuse them or make mistakes

### Third Party

- **Type**: Third Party
- **Capability Level**: Medium
- **Motivations**: Financial, Accidental
- **Resources**: Moderate
- **Relevant**: Yes
- **Priority**: 5/10
- **Description**: A vendor, partner, or service provider with access to the system

### Prompt-Injection Attacker

- **Type**: External
- **Capability Level**: Medium
- **Motivations**: Curiosity, Reputation, Disruption
- **Resources**: Limited
- **Relevant**: Yes
- **Priority**: 2/10
- **Description**: Adversary specializing in jailbreaking LLMs and abusing tool-using agents to coerce off-topic, costly, or system-revealing behavior

## Trust Boundaries

### Trust Zones

#### Internet

- **Trust Level**: Untrusted
- **Description**: The public internet, considered untrusted

#### DMZ

- **Trust Level**: Low
- **Description**: Demilitarized zone for public-facing services

#### Application

- **Trust Level**: Medium
- **Description**: Zone containing application servers and services

#### Data

- **Trust Level**: High
- **Description**: Zone containing databases and data storage

#### Admin

- **Trust Level**: Full
- **Description**: Administrative zone with highest privileges

### Trust Boundaries

#### Internet Boundary

- **Type**: Network
- **Controls**: Web Application Firewall, DDoS Protection, TLS Encryption
- **Description**: Boundary between the internet and internal systems

#### DMZ Boundary

- **Type**: Network
- **Controls**: Network Firewall, Intrusion Detection System, API Gateway
- **Description**: Boundary between public-facing services and internal applications

#### Data Boundary

- **Type**: Network
- **Controls**: Database Firewall, Encryption, Access Control Lists
- **Description**: Boundary protecting data storage systems

#### Admin Boundary

- **Type**: Network
- **Controls**: Privileged Access Management, Multi-Factor Authentication, Audit Logging
- **Description**: Boundary for administrative access

## Assets and Flows

### Assets

| ID | Name | Type | Classification | Sensitivity | Criticality | Owner |
|---|---|---|---|---|---|---|
| A001 | User Chat Prompts | Data | Internal | 2 | 2 | Application |
| A002 | LLM Responses | Data | Internal | 2 | 3 | Application |
| A003 | Uploaded Infrastructure Files | Data | Internal | 2 | 2 | Application |
| A004 | CloudWatch Conversation Logs | Data | Internal | 3 | 3 | Operations |
| A005 | Bedrock Invocation Capacity | Other | Internal | 3 | 5 | Owner Account |
| A006 | ECS Task IAM Credentials | Credential | Restricted | 5 | 5 | Backend Service |
| A007 | Cognito User Identities &amp; Tokens | Credential | Confidential | 5 | 4 | Identity |
| A008 | Bedrock Guardrails Configuration | Configuration | Internal | 3 | 4 | Security |

### Asset Flows

| ID | Asset | Source | Destination | Protocol | Encrypted | Risk Level |
|---|---|---|---|---|---|---|
| F001 | User Chat Prompts | C015 | C005 | HTTPS | Yes | 3 |
| F002 | User Chat Prompts | C005 | C009 | HTTPS | Yes | 3 |
| F003 | LLM Responses | C009 | C015 | HTTPS | Yes | 2 |
| F004 | Uploaded Infrastructure Files | C015 | C007 | HTTPS | Yes | 3 |
| F005 | Uploaded Infrastructure Files | C007 | C005 | HTTPS | Yes | 3 |
| F006 | CloudWatch Conversation Logs | C005 | C011 | HTTPS | Yes | 2 |
| F007 | Bedrock Invocation Capacity | C005 | C009 | HTTPS | Yes | 4 |
| F008 | ECS Task IAM Credentials | C005 | C005 | HTTP | No | 4 |
| F009 | Cognito User Identities &amp; Tokens | C015 | C012 | HTTPS | Yes | 3 |
| F010 | Cognito User Identities &amp; Tokens | C015 | C005 | HTTPS | Yes | 3 |
| F011 | Bedrock Guardrails Configuration | C014 | C006 | HTTPS | Yes | 2 |

## Threats

### Resolved Threats

#### T1: External Attacker

**Statement**: A External Attacker able to upload files via the public chat UI can upload malicious files containing code-injection or path-traversal payloads, which leads to code execution, data exfiltration, or parser exploitation in backend

- **Prerequisites**: able to upload files via the public chat UI
- **Action**: upload malicious files containing code-injection or path-traversal payloads
- **Impact**: code execution, data exfiltration, or parser exploitation in backend
- **Impacted Assets**: A003
- **Tags**: STRIDE-T, File Upload

#### T2: Script Kiddie

**Statement**: A Script Kiddie with internet access and the public URL can flood Bedrock invocations to drive cost or exhaust quota, which leads to unexpected AWS charges and degraded service for legitimate users

- **Prerequisites**: with internet access and the public URL
- **Action**: flood Bedrock invocations to drive cost or exhaust quota
- **Impact**: unexpected AWS charges and degraded service for legitimate users
- **Impacted Assets**: A005
- **Tags**: STRIDE-D, API Abuse, Cost

#### T3: Prompt-Injection Attacker

**Statement**: A Prompt-Injection Attacker with knowledge of LLM jailbreak techniques can craft prompts that bypass Guardrails, manipulate tool calls, or extract the system prompt, which leads to unauthorized tool invocations, system-prompt disclosure, or off-topic AI behavior

- **Prerequisites**: with knowledge of LLM jailbreak techniques
- **Action**: craft prompts that bypass Guardrails, manipulate tool calls, or extract the system prompt
- **Impact**: unauthorized tool invocations, system-prompt disclosure, or off-topic AI behavior
- **Impacted Assets**: A001, A002, A005
- **Tags**: STRIDE-E, Prompt Injection, LLM

#### T4: External Attacker

**Statement**: A External Attacker with read access to CloudWatch or to a backup of logs can read conversation logs containing user queries and infrastructure-file metadata, which leads to exposure of user infrastructure details and pricing-query usage patterns

- **Prerequisites**: with read access to CloudWatch or to a backup of logs
- **Action**: read conversation logs containing user queries and infrastructure-file metadata
- **Impact**: exposure of user infrastructure details and pricing-query usage patterns
- **Impacted Assets**: A001, A004
- **Tags**: STRIDE-I, Logging

#### T5: External Attacker

**Statement**: A External Attacker able to discover the ALB DNS or escape CloudFront prefix-list scoping can access the ALB directly, bypassing CloudFront and WAF protections, which leads to bypass of rate limits, WAF rules, and DDoS protection

- **Prerequisites**: able to discover the ALB DNS or escape CloudFront prefix-list scoping
- **Action**: access the ALB directly, bypassing CloudFront and WAF protections
- **Impact**: bypass of rate limits, WAF rules, and DDoS protection
- **Impacted Assets**: A005
- **Tags**: STRIDE-S, Network, Bypass

#### T6: External Attacker

**Statement**: A External Attacker with RCE on a backend container or container escape can read ECS task-metadata endpoint to steal IAM credentials, which leads to unauthorized use of Bedrock, Pricing API, or S3 via stolen task creds

- **Prerequisites**: with RCE on a backend container or container escape
- **Action**: read ECS task-metadata endpoint to steal IAM credentials
- **Impact**: unauthorized use of Bedrock, Pricing API, or S3 via stolen task creds
- **Impacted Assets**: A006
- **Tags**: STRIDE-E, IAM, Credential Theft

#### T7: External Attacker

**Statement**: A External Attacker with the ability to phish a Cognito user (AuthEnabled=true) can capture Cognito tokens via reflected XSS or social engineering and replay them, which leads to account takeover for the duration of the access-token TTL

- **Prerequisites**: with the ability to phish a Cognito user (AuthEnabled=true)
- **Action**: capture Cognito tokens via reflected XSS or social engineering and replay them
- **Impact**: account takeover for the duration of the access-token TTL
- **Impacted Assets**: A007
- **Tags**: STRIDE-S, Auth, Token Theft

#### T8: External Attacker

**Statement**: A External Attacker authenticated user holding a valid Cognito access token can open many WebSocket connections to bypass rate caps and amplify Bedrock spend, which leads to cost amplification despite per-client limits; budget cap then auto-denies

- **Prerequisites**: authenticated user holding a valid Cognito access token
- **Action**: open many WebSocket connections to bypass rate caps and amplify Bedrock spend
- **Impact**: cost amplification despite per-client limits; budget cap then auto-denies
- **Impacted Assets**: A005
- **Tags**: STRIDE-D, WebSocket, Cost

#### T9: Privileged User

**Statement**: A Privileged User CodePipeline or admin IAM access to deploy can deploy a CFN change that weakens Guardrails, removes the budget cap, or opens the ALB SG, which leads to durable security regression undermining multiple defenses at once

- **Prerequisites**: CodePipeline or admin IAM access to deploy
- **Action**: deploy a CFN change that weakens Guardrails, removes the budget cap, or opens the ALB SG
- **Impact**: durable security regression undermining multiple defenses at once
- **Impacted Assets**: A008, A005
- **Tags**: STRIDE-T, Insider, GitOps

#### T10: External Attacker

**Statement**: A External Attacker with valid session and ability to issue tool-call-ish prompts can induce the agent to issue extreme volumes of Pricing/Savings Plans API calls, which leads to throttling on AWS Pricing API and degraded service for legitimate users

- **Prerequisites**: with valid session and ability to issue tool-call-ish prompts
- **Action**: induce the agent to issue extreme volumes of Pricing/Savings Plans API calls
- **Impact**: throttling on AWS Pricing API and degraded service for legitimate users
- **Impacted Assets**: A002
- **Tags**: STRIDE-D, Tool Abuse

## Mitigations

### Resolved Mitigations

#### M1: File-upload validation: 10 MB size cap, MIME-type allowlist (CFN/Terraform/CDK), malicious-pattern scan, UUID-based naming, parser sandbox, SSE-S3, 7-day lifecycle

**Addresses Threats**: T1

#### M2: Layered cost+rate controls: WAF rate limits (2000/5min general, 1000/5min /api, 50/5min /ws/*), Express limiters (100/min /api, 50/min /api/chat), per-WS chat caps (30/min, 200/day), 100-client WS cap, AWS Budget hard cap with auto-deny policy on Bedrock invoke

**Addresses Threats**: T2, T3, T8, T10

#### M3: Bedrock Guardrails (content/topic/prompt-attack/PII filters) plus AWS-pricing-only system prompt and version-pinning automation

**Addresses Threats**: T2, T3

#### M4: CloudWatch Logs encryption + 7-day retention + truncated-prompt logging + no PII stored + in-memory conversation only

**Addresses Threats**: T4

#### M5: ALB security group restricted to CloudFront prefix list (pl-82a045eb); ALB host-header check enforced

**Addresses Threats**: T5

#### M6: Scoped IAM task role (no wildcard service:* or iam:*), non-root containers, ECS in private subnets, patched dependencies, IMDSv2 only

**Addresses Threats**: T6, T9

#### M7: Cognito hardening when AuthEnabled: FIDO2/WebAuthn passkeys (NIST AAL2), optional/mandatory TOTP MFA, 60-min token TTL, AdminUserGlobalSignOut, Helmet CSP + React escaping to mitigate XSS-driven token theft

**Addresses Threats**: T7

#### M8: WebSocket amplification controls: per-client chat caps (30/min, 200/day) enforced post-upgrade in WebSocketService.checkChatRateLimit, 100 concurrent client cap, AWS Budget hard cap as backstop

**Addresses Threats**: T2, T8

#### M9: GitOps governance for production changes: CodePipeline as the only deploy path, CFN change-set review, IAM-role-per-stage, MFA on admin identities, CloudTrail audit

**Addresses Threats**: T9

#### M10: Tool-call governance: Pricing/Savings Plans API calls bounded by per-message rate caps and Bedrock tool-use limits in bedrockToolService; CloudWatch alarms on throttle metrics

**Addresses Threats**: T10

## Assumptions

### A001: Deployment

**Description**: System operates in AWS us-west-2 as primary region with us-east-1 for CloudFront WAF and ACM certificates. 10 CloudFormation stacks managed via GitOps CodePipeline.

- **Impact**: Defines deployment topology and regions in scope for the threat model
- **Rationale**: CDK/CFN stacks pin these regions; CloudFront WAF must be in us-east-1

### A002: Data

**Description**: No PII or sensitive customer data is stored. Infrastructure file uploads (CFN/Terraform/CDK only) have a 7-day S3 lifecycle. Conversation history is in-memory only and bounded by an LRU cap of 1000 conversations.

- **Impact**: Reduces data-at-rest exposure surface; conversation logs do not require long retention
- **Rationale**: App design intentionally avoids persistent user data; S3 has lifecycle policy; in-memory ring buffer in WebSocketService

### A003: AI/ML

**Description**: Bedrock Guardrails (content filtering, topic boundary, prompt-attack detection, PII blocking) and AWS-pricing-only system prompt provide content filtering for inappropriate inputs and off-topic queries.

- **Impact**: Constrains LLM behavior to AWS pricing topics and blocks prompt-attack categories
- **Rationale**: Guardrails configured per stack 07; system prompt enforces topic; managed automation keeps Guardrail version pinned

### A004: AWS Services

**Description**: Architecture uses ECS Fargate in private subnets, ALB locked to CloudFront prefix list pl-82a045eb, S3 for temp uploads, Bedrock for LLM, Pricing/Savings Plans APIs as agent tools. 10 CFN stacks deployed via GitOps.

- **Impact**: Defines AWS service boundary and attack surface for the model
- **Rationale**: Reflects implemented CFN stack composition under infrastructure/

### A005: Data

**Description**: Conversation history is in-memory only (no DB). Uploaded infrastructure files are limited to CloudFormation/Terraform/CDK formats and expire after 7 days via S3 lifecycle. No PII in any storage path.

- **Impact**: Limits blast radius of any log/storage compromise to ephemeral state
- **Rationale**: By design — pricing tool does not need user data persistence; lifecycle policy enforced

### A006: Software Hygiene

**Description**: All dependencies are patched against known CVEs (probe scans clean). Containers run as non-root. IAM roles are scoped (no wildcard service:* or iam:* actions). CodePipeline is the only path to production.

- **Impact**: Reduces likelihood of supply-chain and privilege-escalation threats
- **Rationale**: Enforced via dependency updates, probe-scan remediation spec, ECS task role least-privilege policies

### A007: Authentication

**Description**: Optional Cognito auth via AuthEnabled CFN parameter (default false). When true: admin-managed users, FIDO2 passkeys (NIST AAL2), optional/mandatory TOTP MFA, JWT validation on REST and WebSocket, Admins group gates /api/admin/*.

- **Impact**: Defines auth mode and admin/user access controls when enabled; default-off preserves open-access sample behavior
- **Rationale**: Cognito stack persists across flag flips; opt-in deployment per stack 12 and backend/middleware/auth.ts

### A008: Authentication

**Description**: Auth-mode threat deltas: account takeover mitigated by passkeys + optional MFA + 60-min token TTLs + AdminUserGlobalSignOut. XSS token theft mitigated by Helmet CSP + React escaping. Cognito availability tolerated via cached sessions. Invite/temp-pwd email via SES + DKIM.

- **Impact**: Documents residual risks introduced when AuthEnabled=true and the controls that absorb them
- **Rationale**: Cognito auth mode adds new threats (token theft, IdP outage, phishing) requiring explicit mitigations; tracked from PCSR V2113197017

### A009: Risk Acceptance

**Description**: Residual risk acceptance: cost-amplification (Bedrock spend) is the primary residual concern; the AWS Budget hard cap with auto-deny policy bounds maximum exposure to the budget threshold per month.

- **Impact**: Caps maximum financial impact of any DoS / abuse path that escapes WAF + Express + WS limiters
- **Rationale**: 11-bedrock-budget.yaml hard cap with SNS-triggered auto-deny policy is the deterministic backstop after layered rate controls

## Phase Progress

| Phase | Name | Completion |
|---|---|---|
| 1 | Business Context Analysis | 100% ✅ |
| 2 | Architecture Analysis | 100% ✅ |
| 3 | Threat Actor Analysis | 100% ✅ |
| 4 | Trust Boundary Analysis | 100% ✅ |
| 5 | Asset Flow Analysis | 100% ✅ |
| 6 | Threat Identification | 100% ✅ |
| 7 | Mitigation Planning | 100% ✅ |
| 7.5 | Code Validation Analysis | 100% ✅ |
| 8 | Residual Risk Analysis | 100% ✅ |
| 9 | Output Generation and Documentation | 100% ✅ |

---

*This threat model report was generated automatically by the Threat Modeling MCP Server.*
