Azure Resource Knowledge Generation Schema
Schema Version: 2.0
Status: Draft – Requires Human Approval
Knowledge Type: Resource-Centric Knowledge
Primary Output: Markdown
Purpose: Generate comprehensive, interconnected Azure platform knowledge for Azure AI Search, CloudOps Chat Service, Knowledge Graph, Ontology and MCP Server.

1. Objective
The objective is to generate a comprehensive knowledge base organised by Azure resource types.

GitHub Copilot's job is limited to creating reviewed content and the Knowledge Graph and Ontology files in the review workspace. Publishing, deployment and service updates are outside this schema's scope.

The generation engine must use the source files supplied under `sources\shared\knowledge-v2` in this repository and human answers in the folder gap files linked from the main `review_gaps.md`. It must consolidate relevant information into one comprehensive Markdown knowledge profile per resource type. It must not discover or use sources from other directories, repositories or external services.

This is NOT a source-file conversion process.

The engine must understand the relationships between resources, how the platform is implemented, why architectural decisions were made, how resources interact and how the platform is operated.

The resulting knowledge must support:

Technical questions.
Architecture questions.
Configuration questions.
Terraform questions.
Dependency questions.
Security questions.
Governance questions.
Operational questions.
Troubleshooting questions.
Design rationale questions.
Impact analysis.
Cross-resource reasoning.
On-demand architecture drawing generation.
2. Core Principles
2.1 Resource-centric knowledge
Generate knowledge based on Azure resource types.

Create one comprehensive Markdown knowledge profile per resource type.

Examples:

Azure Firewall.
Virtual Network.
Virtual WAN.
Private Endpoint.
Private DNS Zone.
Key Vault.
Application Gateway.
Azure Policy.
Managed Identity.
Network Security Group.
Do not generate separate knowledge profiles from individual source files.

Do not create separate Markdown files for every knowledge topic.

Consolidate all relevant information into the corresponding resource profile.

2.2 Source scope and incremental scanning
The only scanned source-file input is Markdown (`.md`, case-insensitive extension) files at any depth under `sources\shared\knowledge-v2` in this repository. Human answers in the folder gap files also provide evidence as defined in section 2.4. The folder may contain the source files for a full scan or only new and changed files for an incremental scan. Report non-Markdown files as skipped; do not read them or use them as evidence.

Do not discover or read sources outside this folder. Do not use other repositories, network locations, external documentation or prior generated files as new source evidence. Previously generated guides and the saved source index may be reused only as prior generated state during an incremental scan.

On the first scan, process every `.md` file under the input folder and create a source index. On each later scan:

do not include agent consumption md files in any depth.

1. Treat files present in the input folder as new or changed-file candidates.
2. Compare each candidate's relative path and SHA-256 content hash with `scaned_sources\manifest.json`.
3. Skip byte-identical files and reuse their indexed evidence; analyse only new or changed files.
4. Use the source index to identify and regenerate any guides affected by changed evidence, including cross-resource references. Validate the resulting guide set without rereading unchanged source files.
5. Do not interpret a file missing from the incremental input folder as deleted. A source deletion requires an explicit human instruction naming its relative path. For an explicitly deleted source, retain its archived file, mark it DELETED in the manifest, exclude its evidence from current synthesis, and regenerate all affected guides from the remaining indexed evidence.

Preserve each source's relative directory path under `scaned_sources`. After the Job 1 draft outputs and report have been written successfully, move each successfully read input file into that archive, replacing the archived version of the same relative path only after the new version is successfully indexed. Keep unchanged archived files and their index entries. Leave failed or skipped files in the input folder and report them so they can be corrected or explicitly excluded. Never move or archive `agent-consumption.md`. The archive is a reference and comparison baseline, not an additional source-discovery location.

Record source relative paths, hashes, processing status, evidence identifiers and affected resource/topic identifiers in `scaned_sources\manifest.json` and `reviews\shared\guides\review\source_index.json`. If either index is missing or invalid, stop incremental processing and require a full scan; the complete source collection must be supplied under `sources\shared\knowledge-v2` for that run. Report every discovered, processed, unchanged, failed and skipped file.

The engine must not assume that one document contains all information about a resource.

2.3 Cross-source knowledge synthesis
For each resource type, use all evidence in the source index. On the first scan, discover and read every eligible source file. On an incremental scan, discover changed/new files, read and analyse those files, and reuse indexed evidence for unchanged files.

Identify resource types and aliases.
Extract technical information.
Extract Terraform implementation details.
Extract architecture information.
Identify dependencies and integrations.
Extract security and governance information.
Extract operational procedures.
Extract troubleshooting information.
Extract documented decisions and rationale.
Identify relationships with other resources.
Cross-reference all evidence.
Consolidate the information into one resource profile.
Identify unresolved knowledge gaps.
The engine must combine complementary information across all indexed source files in the single allowed source collection.

It must not claim that all files were analysed if some files were skipped or failed processing.

2.4 Evidence-based knowledge: only two states
Every factual statement in reviewed knowledge, including values and their reasons, must use one of exactly two evidence states:

1. `source evidence`: explicitly established by a source file supplied under `sources\shared\knowledge-v2`. Cite the source file and section and include the supporting source/code links. The cited evidence must support the specific statement; a link that merely mentions the topic is not sufficient.
2. `user confirmed`: an actual answer supplied by the human in a folder gap file linked from the main `review_gaps.md`, or a previously incorporated human answer. Mark that content as `user confirmed`. Never apply this label to source-only facts, generated text or an answer the human has not supplied.

Only `source evidence` and `user confirmed` are allowed. No other fact/evidence state or substitute label is permitted. Keep each statement's origin intact when reusing it in resource profiles, decisions, architecture, glossary, graph and ontology.

Apply this rule separately to the value and its reason. If the source establishes the value but not its reason, retain the value with its source evidence and ask the human only for the missing reason. Reuse earlier human answers without asking again. Unanswered questions belong in the folder gap files, not in factual knowledge as a third state, an assumption or placeholder text.

During Job 1, treat a source marker for missing or conflicting information as a prompt to investigate, not as evidence of a value or its reason. Keep any supported facts alongside the marker. If other indexed evidence or a prior human answer resolves the issue, use that evidence without asking again. Otherwise, ask only if the information is required for the declared platform setup. Do not copy the marker into guide Markdown or decision JSON, or edit the source to remove it.

If the source files leave required platform information missing, uncertain or conflicting after the investigation in section 7.1, ask for it in a folder gap file and link the affected guide files directly from the main `review_gaps.md`. Apply the scope boundary in section 2.6; absence of domain-team runtime data is not itself a knowledge gap. Do not fill a gap with an assumption or with placeholder text saying the information is missing; the human supplies the missing value or reason. Incorporate the answer as `user confirmed`, not as `source evidence` and not by gap ID. It does not need separate confirmation from a source file.

These two evidence states describe fact origins, not new metadata/status fields. DRAFT, VERIFIED and APPROVED apply only to the guide-review workflow in section 7.4; they are not fact/evidence states.

Never invent technical configurations, resource relationships, architecture decisions, ownership or operational procedures.

2.5 GitHub Copilot execution
All AI actions in both jobs must be performed by GitHub Copilot. Do not use external AI agents or separately invoked AI/model APIs for source analysis, synthesis, validation, gap processing, or graph and ontology generation.

Non-AI scripts and tools may perform file operations, hashing and other deterministic processing, but must not delegate AI work outside GitHub Copilot.

2.6 Platform setup and domain-team runtime data
This boundary applies to every resource type, not only GSA, Private Endpoints or Private DNS.

Platform knowledge describes CloudOps top-level setup, policies, automation, supported capabilities, ownership boundaries and the procedures users follow to create and configure their resources. Domain teams supply their workload resources and inputs. Dependent objects are created by the applicable mechanism for that resource type; for example, applicable policies configure private endpoint DNS integration and records after users create the dependent resources.

Document the mechanism and its conditions from source evidence or human answers. Do not assume every resource or dependent object is created by policy, or that a declared policy has successfully run on every resource.

The inventory of individual user resources, which resources have actually been onboarded, and runtime contents such as generated DNS records are domain-team data. They cannot be verified from platform source snapshots alone. Their absence does not require a human question or a per-instance verification exercise, and guides do not mention it. Document the declared setup, retaining relevant instance evidence when it is supplied without claiming current live verification.

Genuinely missing platform behavior, policy definitions/configuration, access controls, shared infrastructure responsibilities and operational procedures remain in scope. For a question that mixes these with domain-team inventory, resolve only the answered or out-of-scope portion and keep the unresolved platform question. Record the human scope answer in the affected guides and reuse the shared scope decision across related guides.

2.7 Default ownership
CloudOps owns, maintains, deploys and operates everything defined in the scanned source repositories (decision `knowledge-cloudops-ownership-default`, GAP-741; reconfirmed: "cloudops owns all inside these repos"). State CloudOps as the owner, operator and maintainer in guides; do not ask which team owns, operates or maintains such an item. For a CloudOps-run process, the approver is CloudOps unless a source or a recorded exception says otherwise. Ownership does not by itself establish approval mechanisms, required permissions or operational procedures; keep genuine questions about how something is approved, recorded or performed when sources do not show it. Apply the recorded exceptions in that decision (they cover items outside these repositories). Raise an ownership gap only when a source names a different team or sources conflict.

3. Resource Identification and Classification
Identify resource types using:

Azure resource provider and resource type.
Terraform resource types.
Terraform module names.
Resource names.
Documentation terminology.
Synonyms and aliases.
Architecture references.
Relationships with other resources.
Example:

Resource name: Private Endpoint

Azure resource type: Microsoft.Network/privateEndpoints

Terraform resource: azurerm_private_endpoint

All relevant information must be associated with the canonical resource type.

Maintain consistent resource identifiers across generated profiles, knowledge graph and ontology.

4. Resource Knowledge Profile
Generate one Markdown file per resource type.

Filename convention:

<resource-name>.md

Examples:

private-endpoint.md
virtual-network.md
virtual-wan.md
azure-firewall.md
private-dns.md
key-vault.md
Every profile must follow the topics below.

5. Mandatory Knowledge Topics
5.1 Resource Metadata
Store metadata only in YAML front matter at the beginning of each profile. Do not duplicate it in a Markdown metadata table or add guide-status fields.

Use exactly these fields:

```yaml
---
knowledge_id: "resource.azure_firewall"
resource_name: "Azure Firewall"
azure_resource_type: "Microsoft.Network/azureFirewalls"
resource_provider: "Microsoft.Network"
terraform_resource_type: "azurerm_firewall"
category: "Networking"
subcategory: "Firewall"
synonyms: ["Azure Firewall"]
related_resource_types: ["resource.firewall_policy", "resource.virtual_network"]
source_repositories: ["almbrand/cloudops-firewall-analysis"]
source_references: ["cloudops-firewall-analysis/repository.md § Identity and overview"]
version: "1.0"
generation_date: "2026-11-20"
---
```

The example values illustrate the format only. Determine metadata from the indexed evidence and resource catalogue, not from example values.

Use exactly these field names and types: `knowledge_id`, `resource_name`, `azure_resource_type`, `resource_provider`, `terraform_resource_type`, `category`, `subcategory`, and `version` are quoted YAML strings; `synonyms`, `related_resource_types`, `source_repositories`, and `source_references` are YAML arrays of quoted strings; `generation_date` is a quoted `YYYY-MM-DD` string.

Use the canonical resource ID for `knowledge_id` and each related resource. Record related resource identifiers, not Markdown links, in front matter; links may appear in the guide body. Use the actual repository name only when the evidence establishes it. `source_references` contains the evidence references for the profile. Use `[]` for an empty list. When the evidence does not establish a scalar value, write `""` and ask for the value and its reason in a folder gap file; do not guess or write placeholder text. Only a guide linked from an open question may have an empty scalar value. Set `version` to `"1.0"` and set `generation_date` to the actual date the guide is generated.

The YAML front matter is the profile's Resource Metadata topic. Do not repeat these fields as a body heading or table. Continue the profile body with the other mandatory knowledge topics in section 5.
5.2 Resource Overview
Explain:

What is the resource?
What problem does it solve?
Why is it used?
What are its capabilities?
What are its limitations?
Which Azure services support it?
What are its important technical concepts?
What are its common use cases?
How does it differ from similar resources?
5.3 Architecture and Design
Document:

Architecture overview.
Purpose in the Azure platform.
Logical architecture.
Technical architecture.
Architecture components.
Resource placement.
Subscription placement.
Resource group placement.
Network topology.
Communication paths.
Traffic flows.
Integration points.
High availability.
Resilience.
Disaster recovery.
Architecture boundaries.
Platform-specific design.
Answer:

How does the architecture work?
Why is it designed this way?
Which components participate?
How do components communicate?
What happens when a component becomes unavailable?
What alternatives exist?
What are the architectural trade-offs?
5.4 Platform Implementation
Document actual organisational implementation:

Platform-specific implementation.
Deployment model.
Naming conventions.
Subscription placement.
Resource locations.
Resource ownership.
Environment differences.
Platform-specific configuration.
Implementation standards.
Exceptions.
Customisations.
Clearly distinguish general Azure capabilities from actual platform implementation.

5.5 Terraform Implementation
Document:

Managing repository.
Terraform modules.
Terraform resources.
Module inputs.
Variables.
Defaults.
Outputs.
Data sources.
Locals.
Resource dependencies.
Provider requirements.
Terraform versions.
State management.
Configuration files.
Deployment workflows.
Pipeline references.
Module dependencies.
Customisation.
Known Terraform limitations.
Answer:

Which repository manages the resource?
Which module deploys it?
How is it configured?
Which variables control it?
Which outputs are exposed?
What must exist before deployment?
How is deployment triggered?
How can it be changed safely?
What happens when deployment fails?
Only document configurations supported by source evidence or user confirmed answers (section 2.4).

5.6 Configuration and Properties
Document:

Important resource properties.
Mandatory properties.
Optional properties.
Default values.
Allowed values.
SKU and tier information.
Configuration dependencies.
Platform defaults.
Custom settings.
Feature-specific configurations.
Restrictions.
Explain the purpose and impact of important configuration settings.

5.7 Dependencies and Integrations
This is a mandatory topic.

Document the complete dependency architecture.

Identify:

Required dependencies.
Optional dependencies.
Conditional dependencies.
Upstream resources.
Downstream resources.
Parent resources.
Child resources.
Integrated Azure services.
External services.
DNS dependencies.
Network dependencies.
Identity dependencies.
Security dependencies.
Terraform dependencies.
Operational dependencies.
For each dependency explain:

Dependency name.
Azure resource type.
Relationship type.
Why the dependency exists.
Whether it is mandatory or optional.
How it is configured.
How it interacts with the resource.
What happens if it becomes unavailable.
What happens if it is deleted.
Source evidence.
5.8 Dependency Impact Analysis
Explain the impact of changes to the resource and its dependencies.

Answer:

What depends on this resource?
What does this resource depend on?
What happens if a dependency is deleted?
What happens if this resource is deleted?
What happens if its configuration changes?
Which services could be affected?
Which resources must be updated together?
What is the potential operational impact?
Which other resource profiles must be consulted?
Include only impacts backed by source evidence or a user confirmed answer (section 2.4).

5.9 Networking and Connectivity
Where applicable, document:

Virtual networks.
Subnets.
IP addressing.
Network interfaces.
Routing.
Route tables.
UDRs.
BGP.
DNS.
Private DNS.
Private Endpoints.
Private Link.
Network Security Groups.
Firewall integration.
VPN.
ExpressRoute.
Hybrid connectivity.
Ports.
Protocols.
Traffic direction.
Network restrictions.
Explain complete connectivity and DNS resolution paths.

5.10 Identity and Access Management
Document:

Azure RBAC.
Required roles.
Required permissions.
Managed identities.
Service principals.
Authentication.
Authorisation.
PIM.
Role assignments.
Access restrictions.
Cross-subscription access.
Deployment permissions.
5.11 Security and Governance
Security is a mandatory knowledge area.

Where applicable, document:

Security architecture.
Security controls.
Network security.
Identity security.
Authentication and authorisation.
Encryption.
Data protection.
Key management.
Certificates.
Secrets management.
Key Vault integration.
Azure Policy.
Policy assignments.
Initiatives.
Compliance requirements.
Governance standards.
Security exceptions.
Defender for Cloud.
Threat protection.
Security monitoring.
Auditing.
Logging.
Explain why security controls exist, how they are implemented and which other resources they depend on.

Do not assume that every security feature is enabled merely because Azure supports it.

5.12 Operations and Management
Document:

Deployment procedures.
Configuration updates.
Maintenance.
Monitoring.
Diagnostics.
Logging.
Alerts.
Performance.
Capacity.
Scaling.
Backup.
Recovery.
Lifecycle management.
Operational responsibilities.
Common workflows.
Where possible, procedures must include:

Prerequisites.
Steps.
Expected results.
Verification methods.
Failure conditions.
5.13 Troubleshooting and Known Errors
Consolidate known errors from all source files.

For each issue include:

Error ID.
Error message.
Symptoms.
Affected resource.
Conditions.
Root cause.
Diagnostic steps.
Commands.
Relevant logs.
Resolution.
Workaround.
Related dependencies.
Source evidence.
Support resolutions and suggested troubleshooting steps with source evidence or user confirmed answers (section 2.4).

5.14 Design Decisions and Rationale
Consolidate documented architecture and technical decisions.

Include:

Decision ID.
Title.
Context.
Problem.
Decision.
Rationale.
Alternatives.
Advantages.
Disadvantages.
Consequences.
Related resources.
Decision status.
Evidence.
Owner, if documented.
Reuse the explanation from the relevant decision topic rather than repeating it for each resource. If the reason is still missing after investigating existing evidence and human answers, ask one broader question in `review\gaps\decisions\review_gaps.md` and link all affected guides from the main index. Incorporate the human answer as `user confirmed`.

Never invent design decisions.

5.15 Limitations and Constraints
Document:

Azure service limitations.
SKU restrictions.
Platform restrictions.
Terraform limitations.
Network limitations.
Security restrictions.
Operational constraints.
Service dependencies.
Known workarounds.
Unsupported scenarios.
5.16 Examples and Use Cases
Include:

Actual platform examples.
Common deployment scenarios.
Configuration examples.
Network flow examples.
Operational scenarios.
Troubleshooting examples.
Integration examples.
Clearly label illustrative examples.

5.17 Chat Service Question Coverage
Every profile must support the following question categories.

What questions
What is the resource?
What does it do?
What capabilities does it provide?
Why questions
Why do we use it?
Why is it configured this way?
Why was it selected over alternatives?
How questions
How does it work?
How is it deployed?
How is it configured?
How is it maintained?
How do we troubleshoot it?
Where questions
Where is it deployed?
Where is it managed?
Where is its Terraform code?
Where are its dependencies?
Which questions
Which resources depend on it?
Which policies apply?
Which modules deploy it?
Which configurations are supported?
Who questions
Who owns it?
Who manages it?
Who can access it?
Only answer when evidence exists.

Dependency questions
What does it depend on?
What depends on it?
How are dependencies connected?
What happens if a dependency fails?
Architecture questions
Explain its architecture.
Show its connectivity.
Explain its traffic flow.
Show how it integrates with other resources.
Security questions
How is it secured?
Which security policies apply?
Which identities can access it?
What permissions are required?
Which network restrictions apply?
Troubleshooting questions
Why is it failing?
How can the issue be diagnosed?
What is the resolution and its supporting evidence?
Impact analysis questions
What happens if it is modified?
What happens if it is deleted?
Which components might be affected?
Comparison questions
How does it differ from similar resources?
What are the alternatives?
What are the trade-offs?
Include representative questions and evidence-backed answers where sufficient information exists.

Never fabricate answers to achieve question coverage.

5.18 On-Demand Architecture Drawing Support
Do not generate or store separate diagram files during knowledge generation.

Do not generate Mermaid diagrams.

The resource knowledge profile must contain sufficient structured architecture information to support on-demand Draw.io diagram generation by the Chat Service.

Document:

Architecture components.
Azure resource types.
Resource identifiers.
Dependencies.
Relationships.
Network boundaries.
Subscription boundaries.
Traffic flows.
Protocols and ports supported by source references or human answers.
Security boundaries.
Connectivity paths.
Evidence references.
Related resource profiles.
When a drawing is requested, the Chat Service must:

Retrieve the relevant resource knowledge profile.
Retrieve connected resource profiles.
Retrieve relevant relationships from the knowledge graph.
Retrieve architecture and connectivity information.
Consolidate the architecture.
Generate an editable Draw.io diagram.
Use official Microsoft Azure architecture icons.
Validate connections against available evidence.
Show only relationships backed by source evidence or a user confirmed answer (section 2.4).
Drawings must be generated only when requested.

Do not create permanent drawing files as part of knowledge generation.

5.19 Evidence and Knowledge Gaps
Include:

Source references.
Repository names.
Source file paths.
Source sections.
Source commit information, where available.

List only references here. Do not list missing information, knowledge limits or open questions; ask for missing information in folder gap files (section 2.4).
6. Resource Type and Resource Instance Separation
The system must distinguish resource type knowledge from actual deployed resource instances.

6.1 Resource type knowledge
Example:

Microsoft.Network/privateEndpoints

Contains general capabilities, platform implementation, Terraform, architecture, dependencies, configuration, security, operations and troubleshooting.

6.2 Resource instance knowledge
Example:

A specific Private Endpoint deployed in a particular subscription and region.

Where instance information exists, document:

Resource ID.
Resource name.
Resource type.
Subscription.
Resource group.
Region.
Actual configuration.
Private IP.
Target resource.
Subnet.
DNS integration.
Connected resources.
Terraform ownership.
Repository.
Module.
Instance-specific evidence.
Instance information must be distinguishable from general resource type knowledge.

Multiple instances should be supported without creating unnecessary individual Markdown profiles.

Instance details are evidence to retain when supplied, not a mandatory census. Apply section 2.6 across every resource type: do not ask for user-resource inventories or runtime verification merely to complete these fields.

7. Knowledge Gap Detection and Resolution
The system must automatically investigate knowledge gaps before asking for human input.

7.1 Automatic investigation
When information is missing:

Search all eligible files on the first scan. For incremental scans, search the saved source index, archived evidence references, existing guides, architecture topics, operational guides, known errors, decisions, connected resource profiles and glossary entries. Read unchanged source files only when a full scan is required or the saved index cannot establish the needed evidence.
Cross-reference related evidence.
Determine whether the missing information can be established.
Do not ask the user before completing this investigation.

A prior GAP label or an empty metadata field does not by itself require a human question. Resolve facts and technical classifications from the available evidence. Ask only for a missing fact or decision that genuinely needs human input; do not invent an answer or ask the user to repeat information already supplied.

Apply section 2.6 before creating or retaining a gap. Missing user-resource inventories or policy-generated runtime contents are not missing platform design knowledge. Incorporate the human's answer about the creation mechanism as `user confirmed` in the affected guides; do not keep asking for those instances, treat their absence as failed platform verification or write their absence into guides. Preserve any separate unresolved platform question.

Do not use external documentation. The source scope is limited to `sources\shared\knowledge-v2`.

7.2 Gap classification
Use:

MISSING_INFORMATION.
MISSING_ARCHITECTURE.
MISSING_CONFIGURATION.
MISSING_DEPENDENCY.
MISSING_DECISION_RATIONALE.
MISSING_OPERATIONAL_PROCEDURE.
MISSING_TROUBLESHOOTING.
CONFLICTING_INFORMATION.
UNVERIFIED_ASSUMPTION.
MISSING_INSTANCE_INFORMATION.
7.3 Review gap files and source-folder batches
Use source-folder batching on the first run and every later run, except for shared design-rationale questions, which belong in the decisions form. Generate questions only for information that genuinely needs human clarification.

The main file is a small review index, not one large question-and-answer form:

`reviews\shared\guides\review\review_gaps.md`

It groups open questions by resource topic, links to their question-and-answer entries, and directly links every guide that still needs input. It is the only file that controls guide status.

Store the detailed questions and answers separately for each top-level source folder under `sources\shared\knowledge-v2`:

`reviews\shared\guides\review\gaps\<source-folder>\review_gaps.md`

For example, questions arising from `sources\shared\knowledge-v2\cloudops-azure-vwan\` belong in `review\gaps\cloudops-azure-vwan\review_gaps.md`. Use `_root` for sources directly in the input root and `_unassigned` when the saved evidence cannot identify a source folder; do not invent an attribution.

Keep one globally unique gap ID and one answer location for each question. If a gap concerns several source folders, keep its entry only in the first related folder in alphabetical order; do not list or link it from the other folder files. If it affects several resources, link the same entry from each resource topic in the main index. Do not duplicate the question or ask for the same answer again.

Use `review\gaps\decisions\review_gaps.md` only as a temporary interview form for unanswered `MISSING_DECISION_RATIONALE` questions, preserving their real source paths and folders in the review index while they remain open. Ask broad questions about shared design decisions, not the same "why" question for each resource. Reuse existing decisions and human answers before asking anything new.

After validating an answer, record the explanation once in the appropriate permanent `reviews\shared\guides\decisions\<topic-name>.json` file. Related guides link only to that permanent decision, for example `../decisions/<topic-name>.json#<anchor>` (section 12), never to the temporary question form. Guides, decision JSON and graph records must not link to or cite gap files as evidence. Once the answer is incorporated into every affected guide, delete the question and answer from the review artifacts, keep no gap history, and delete the empty gap file and folder (section 7.4). Delete the main review gap index when all questions are resolved and incorporated.

For example, why the Service Catalog separates approved deployment code from team input is one shared decision, not a separate question for every resource it creates.

The split is for review organisation only. Each resource guide must still combine all relevant indexed evidence across all source folders.

Each entry in a folder file is a simple, human-readable question and answer:

The gap ID as the heading.
**Question:** the specific question for the human.
**What we already know:** the existing evidence from the sources.
**Guide:** relative links to every guide that needs this input.
**Answer:** blank until the human answers.

Keep the other gap details (resource, instance, source paths and folders, category, missing information, what was searched, why it matters, priority and status) in `source_index.json` only; do not show them in the question files.

Example:

## GAP-001

**Question:** Does the platform use centralised DNS forwarding for Private Endpoint name resolution?

**What we already know:** The sources describe Private Endpoint creation but not the DNS forwarding architecture.

**Guide:** [private-endpoints.md](../../../resource-knowledge/private-endpoints.md), [private-dns.md](../../../resource-knowledge/private-dns.md)

### Answer

Use these statuses in order: `AWAITING_INPUT` (created with a blank answer), `ANSWER_PROVIDED`, `VALIDATING`, and `INCORPORATED`. If a human declines to answer, keep the status `AWAITING_INPUT`.

7.4 Gap lifecycle and guide status
Investigate each gap using the allowed source collection and saved index before asking for human input. The folder gap files are the reviewer's Q&A forms: leave each answer blank until the human provides it. The human answer supplies only the missing value, its reason, or both; do not re-ask for a part already established by evidence.

After answers are provided, validate them and incorporate them into the affected guides as `user confirmed`. Preserve source evidence for any part already established by sources. The guides are the only record of an answer; do not keep the question, answer or incorporation result anywhere else.

After a gap has been incorporated into every affected guide, delete it from the folder gap file, the index and the synthesis report; keep no history. The index keeps only a counter of the last assigned gap number so IDs are never reused. Delete a folder gap file and its folder when it has no remaining questions. Remove a guide's direct link from the main index only when no remaining gap needs input for that guide; it then becomes VERIFIED while other topics remain open.

Keep the main `review_gaps.md` until every question has an answer and every answer has been validated and incorporated. Then delete it and the empty folder gap files. Do not automatically delete the main file while any question is unanswered or any answer remains unvalidated. If no gaps are found, do not create it.

Guide status is decided only by the main `reviews\shared\guides\review\review_gaps.md`, never by an individual folder gap file. Apply exactly these three rules:

Rule 1 – DRAFT: `review_gaps.md` exists and contains a link to the guide.
Rule 2 – VERIFIED: `review_gaps.md` exists and contains no link to the guide.
Rule 3 – APPROVED: `review_gaps.md` does not exist. Every guide is APPROVED.

No other guide status or status rule exists. Publishing is outside this schema.

Deleting a folder gap file is not approval; preserve its unresolved entries in the saved index and restore the form on the next run. If the human deletes the main file, Rule 3 still applies: every guide is APPROVED. Remove the obsolete folder forms and their gaps; do not introduce another approval gate.

Any topic merge, split or rename that requires review is recorded as a folder gap entry linked from the main `review_gaps.md`, with category `Topic change` and the affected topic files linked. GitHub Copilot Desktop presents the change for human input; the response is the gap answer, not a separate approval step. If the human rejects the change, keep the original topic files and incorporate that answer.

Record each guide's status only in `reviews\shared\guides\review\synthesis_report.md`. Do not add status fields to the guides.

7.5 One review topic at a time
Human review proceeds one resource or shared decision topic at a time, permanently, not only on the first run:

1. Select one resource or shared decision topic from the main review index.
2. Present only that topic's unresolved questions in GitHub Copilot Desktop, following their links to the question files when necessary.
3. Record the human's answers in the existing answer locations. Leave unanswered questions open; never answer them automatically.
4. Validate and incorporate those answers into every affected guide, including dependent guides. Delete the incorporated gaps and refresh the index.
5. Continue with the next resource topic after the current topic is handled or the human explicitly chooses to defer it.

Keep the existing per-guide and per-gap identifiers when resuming. Read existing answers before migrating an older single-file gap form into folder files; do not lose or re-ask them.

Independent source extraction and guide-generation tasks may still run in parallel through GitHub Copilot. The scripts default to four concurrent sessions, adjustable with `--parallel`; this does not create parallel human-review topics.

7.6 Rejected placeholder text
The validator rejects any guide or decision file that contains placeholder text for missing information or a source review marker (section 2.4). A rejected file stays in place and is regenerated on the next run.

1. Record each rejection against the file and give it to the guide writer on the next run, with the line numbers.
2. The writer fixes every rejection: replace the placeholder using `source evidence` or an actual `user confirmed` answer, preserving its origin as defined in section 2.4. If neither establishes a required value or reason, raise a gap asking only for the missing part.
3. If the file is still rejected after the writer has been told, ask the human automatically: create one gap for that file in the folder gap files, quoting each rejected line, asking for the correct value and the reason for it, and link the file from the main `review_gaps.md`. Do not create a second gap for the same file while one is open.
4. Incorporate the answer as in section 7.4. A rejection is never resolved by deleting the statement without an answer or by rewording it into other placeholder text.

8. Knowledge Relationships and Identifiers
All resource profiles must use stable identifiers.

Examples:

resource.azure_firewall
resource.private_endpoint
resource.virtual_network
resource.virtual_wan
resource.private_dns_zone
resource.key_vault
decision.centralised_dns
procedure.private_endpoint_deployment
error.private_endpoint_dns_failure
Supported relationships include:

DEPENDS_ON.
CONNECTED_TO.
HOSTED_IN.
PART_OF.
CONFIGURED_BY.
DEPLOYED_BY.
MANAGED_IN.
GOVERNED_BY.
AUTHENTICATES_WITH.
ROUTES_THROUGH.
RESOLVES_THROUGH.
INTEGRATES_WITH.
DOCUMENTED_IN.
EXPLAINS.
RESOLVES.
Every relationship must include:

Relationship ID.
Source entity.
Relationship type.
Target entity.
Evidence: `source evidence` with supporting references and links, or a `user confirmed` answer (section 2.4).
Identifiers must be consistent across resource profiles, Knowledge Graph and Ontology.

9. Platform-Wide Architecture
Resource-specific architecture must remain inside the corresponding resource knowledge profile.

Generate the platform-wide architecture folder at:

`reviews\shared\guides\platform-architecture\`

The folder contains:

README.md: an index of the discovered architecture topic files, their scope and related resource knowledge profiles.
One Markdown file per discovered platform-wide architecture topic, named <topic-name>.md.

Discover topics from the actual source documents. Do not use a fixed topic list, a fixed file count or one output file per source document.
Group related architecture information into coherent topics and avoid unnecessary fragmentation.
Do not generate empty topic files or invent architecture to populate them.
Name each topic file in lowercase kebab-case after the discovered topic subject.

Together, these files must explain how the entire Azure platform is organised and how its major components interact.

Cover the following areas where supported by source evidence. These are coverage areas, not a fixed list of output files:

Platform architecture overview.
Subscription structure.
Management group hierarchy.
Connectivity architecture.
Network architecture.
Security architecture.
Identity architecture.
Shared services.
Governance architecture.
Deployment architecture.
Cross-resource dependencies.
Major integration points.
Platform-wide design decisions.
Relationships between resource types.
Each topic file must consolidate information from all resource profiles and architecture sources relevant to that topic.

Keep resource-specific architecture in the corresponding resource knowledge profiles rather than duplicating it in the platform-wide topic files.

Each topic file must reference the corresponding resource knowledge profiles and retain source evidence.

Do not generate a separate platform architecture diagram automatically. Support on-demand Draw.io generation when requested.

10. Output paths and two-job sequence
All review outputs are created directly in the review workspace below `reviews\shared\guides\`. Do not create them elsewhere and then move them to another review directory. `scaned_sources\` is the source archive at the repository root, not an output folder.

The generation process always has two ordered jobs:

Job 1 creates the Markdown guides and review artifacts. Guide status follows section 7.4. It must not create or update any Knowledge Graph or Ontology files or directories.

Job 2 starts only when `review_gaps.md` does not exist (all guides APPROVED). It generates Knowledge Graph and Ontology files from the guides only, never directly from source files.

Use this canonical structure:

```text
scaned_sources\
    manifest.json
    <source-relative-paths...>

reviews\
└── shared\
    └── guides\
        ├── resource-knowledge\
        │   └── <resource-name>.md
        ├── platform-architecture\
        │   ├── README.md
        │   └── <topic-name>.md
        ├── decisions\
        │   ├── index.json
        │   └── <topic-name>.json
        ├── glossary.md
        ├── review\
        │   ├── review_gaps.md (main topic index and guide-status authority)
        │   ├── gaps\ (source folders; decisions for shared rationale)
        │   │   └── <source-folder>\
        │   │       └── review_gaps.md (detailed questions and answers)
        │   ├── conflicts.md
        │   ├── source_index.json
        │   └── synthesis_report.md
        └── graph\
            ├── knowledge-graph\
            │   ├── claims\
            │   ├── config\
            │   ├── coverage\
            │   ├── entities\
            │   ├── evidence\
            │   ├── model\
            │   ├── processes\
            │   ├── profiles\
            │   ├── resource-types\
            │   ├── shared\
            │   ├── manifest.json
            │   ├── README.md
            │   └── requirements.txt
            └── ontology\
                ├── ontology.ttl
                ├── shapes.ttl
                └── context.jsonld
```

Job 1 owns `resource-knowledge\`, `platform-architecture\`, `decisions\`, `glossary.md` and `review\`. Job 2 owns `graph\knowledge-graph\` and `graph\ontology\`. The `ontology\` folder is a sibling of `knowledge-graph\` under `graph\`. Store ontology definitions, shapes and contexts only in `ontology\`, never in `knowledge-graph\` or `knowledge-graph\model\`.

Do not create unnecessary nested folders.

Do not generate separate Markdown files for individual resource topics.

Do not generate separate architecture drawing files.

The structure must support additional resource types without changing the overall generation process.

11. Knowledge Graph and Ontology Compatibility
The generated resource profiles must provide structured information suitable for Knowledge Graph and Ontology generation.

The Knowledge Graph must represent:

Resource types.
Resource instances.
Components.
Repositories.
Terraform modules.
Dependencies.
Architecture decisions.
Policies.
Procedures.
Known errors.
Relationships.
Evidence.
Use consistent identifiers.

The Ontology must define:

Classes.
Properties.
Relationship types.
Domains.
Ranges.
Constraints.
Semantic definitions.
The Knowledge Graph must be generated from APPROVED consolidated knowledge profiles, not independently from individual source files.

The Ontology must define the meaning and constraints of the graph entities and relationships.

12. Glossary and Decisions
Generate the shared glossary at:

`reviews\shared\guides\glossary.md`

Include:

Official terminology.
Definitions.
Acronyms.
Synonyms.
Technical context.
Related resources.
Related knowledge profiles.
Evidence.
Generate the shared decisions folder at:

`reviews\shared\guides\decisions\`

The folder contains only JSON files:

index.json: an index of all discovered decision topic files.
One JSON file per discovered decision topic, named <topic-name>.json.

Do not create Markdown files in the decisions folder. Write each file as UTF-8 JSON with two-space indentation and a trailing newline. Text values hold verbatim Markdown, so links, code spans and lists inside them are preserved.

12.1 Decision topic discovery
Do not use a fixed topic list, a fixed file count or the existing decision filenames as the output structure.
Discover decision topics from the decisions documented in the analysed source documents.
Assign each decision to the topic supported by its source evidence.
Group related decisions into one topic. Do not create a separate topic file for a decision that belongs with related decisions.
Split a topic only when its decisions cover unrelated subjects.
Do not generate a topic file that contains no evidenced decisions.
Name each topic file in lowercase kebab-case after the discovered topic subject.

The index.json file has `schema_version` (1), `title`, optional `notes`, and a `topics` array. Each topic entry has:

`title`: topic name.
`path`: topic file name, `<topic-name>.json`.
`scope`: short scope description.
`decisions`: decision IDs in the topic, as an array. An existing count or summary string from the source index is kept as written.
`related_resource_knowledge_profiles`: related resource knowledge profiles, when known.
`topic_change`: new, unchanged, merged, split or renamed.

Each `<topic-name>.json` file has these root keys, in this order. `schema_version`, `topic`, `title`, `related_resource_knowledge_profiles` and `decisions` are required; include the others when documented:

`schema_version`: 1.
`topic`: the topic file name without `.json`.
`title`: the topic title.
`scope`: the topic scope.
`decision_ids_header`: the source's own decision ID summary, kept only when it is not a plain list of the decision IDs.
`notes`: topic notes.
`related_resource_knowledge_profiles`: an array of `{ "title", "path" }`, where `path` is relative to the decisions folder, for example `../resource-knowledge/<resource-name>.md`.
`source_references`: the source documents for the topic.
`decision_index`: the source's own decision index, kept only when it cannot be derived from the decision records.
`sections`: non-decision content, as an array of `{ "heading", "anchor", "content" }`.
`decisions`: the decision records in section 12.3.

A content block is `{ "title"?, "text" }`, `{ "title"?, "text"?, "items": [{ "title"?, "text" }] }` or `{ "table": { "columns", "rows" } }`.

Every decision and section has an `anchor`: the GitHub-style slug of its heading, unique within the file. Link to a decision as `<topic-name>.json#<anchor>` from inside the decisions folder, or `../decisions/<topic-name>.json#<anchor>` from other guides. The fragment resolves to the decision or section whose `anchor` value matches. Keep anchors stable when a decision is updated so existing links continue to resolve.

12.2 Topic changes
Compare the discovered topics with the existing decision topics in the source documents.
A topic is merged, split or renamed when its decisions no longer map one-to-one to a single existing topic with the same name.
For every merged, split or renamed topic, record the original topic files, the new topic files and the moved decision IDs in `reviews\shared\guides\review\synthesis_report.md`.
Create a `Topic change` entry in a folder gap file and link the affected topic files from the main `review_gaps.md`, as defined in section 7.4. In the existing gap-answer flow, GitHub Copilot Desktop presents the original topic files, proposed topic files and moved decision IDs for human input. Record the response as the gap answer; do not create a separate approval step.

12.3 Decision content
Preserve every existing decision field, decision ID, evidence item and source reference from the source decision records.
Do not rename, renumber, drop or rewrite decision IDs. A decision moved to another topic keeps its original ID.
Keep decision IDs consistent across decision topic files, resource knowledge profiles and the Knowledge Graph, including decisions that affect multiple resource types.

For each decision include, in addition to its existing fields, these keys in this order. `id`, `title` and `anchor` are required:

`id`: Decision ID.
`id_note`: a note the source attaches to the decision ID, if any.
`title`: Title.
`index_title`: the source index title, only when it differs from `title`.
`anchor`: link anchor, as defined in section 12.1.
`heading`: the original heading text, only when it is not the ID, the title or `<id> - <title>`.
`context`: Context.
`problem`: Problem.
`decision`: Decision.
`rationale`: Rationale.
`alternatives`: Alternatives.
`consequences`: Consequences.
`related_resources`: Related resources.
`related_resource_knowledge_profiles`: Related resource knowledge profiles, as `{ "title", "path" }` entries.
`status`: Status.
`owner`: Owner, if documented.
`evidence`: Evidence, as `{ "ids": [<evidence IDs>], "text" }`.
`source_references`: Source references, as `{ "path", "section" }` entries, or `{ "text" }` when a reference has no single path.
Omit an optional key that has no value; never write placeholder text. Store any other existing field under a lowercase snake_case key after these keys.
Fill fields only from `source evidence` or `user confirmed` answers, preserving their attribution as defined in section 2.4. Missing optional fields do not automatically require questions. After investigation, ask only for genuinely needed human input. Put unresolved design reasons in broader questions in `review\gaps\decisions\review_gaps.md`, linking the affected decision and resource guides from the main index.
Only record decisions supported by source documents or human answers. Do not invent decisions or rationale.

12.4 Decision output exclusions
Do not generate or copy review-scenarios.md into any output, or link to it from the decision index.
Evaluation scenarios are not decision records. Do not extract decisions from them, merge them into decision topic files or count them as decision topics.

Do not invent missing definitions or decision rationale.

13. Validation Requirements
Job 1 validates the guides. Graph and ontology validation applies only in Job 2; graph and ontology files are not prerequisites for guide status.

13.1 Source validation
All discovered files accounted for.
Files successfully read.
Failed files reported.
Skipped files explained.
Source references valid.
Repository references traceable.
13.2 Structural validation
Required topics exist.
Metadata is valid.
Every resource profile begins with valid YAML front matter containing exactly the 13 fields and types in section 5.1; the knowledge ID and related resource IDs match the catalogue. Metadata is not duplicated as a Markdown table.
Resource identifiers are unique.
Relationships use valid identifiers.
Internal references resolve.
Decision files are valid JSON in the section 12 structure, the folder holds no Markdown files, and every `<topic-name>.json#<anchor>` link resolves to a decision or section anchor in that file.
Profiles follow the schema.
13.3 Evidence validation
Every factual statement uses only `source evidence` or `user confirmed` as defined in section 2.4. No other fact/evidence states or substitute labels are allowed.
Source evidence includes the source file, section and supporting evidence links; verify that they establish the stated value or reason.
Content marked `user confirmed` must come from an actual human answer. Source-only facts or generated text must not acquire this label. Do not use gap IDs or temporary gap forms as evidence.
Missing, uncertain or conflicting required platform information is raised in folder gap files after investigation, with direct links to the affected guides in the main `review_gaps.md`. Domain-team inventories and runtime contents follow section 2.6 and are not required for guide completeness.
Human answers retain the `user confirmed` state without requiring separate source-file confirmation; do not relabel them as `source evidence`.
Answered gaps are incorporated into the affected files and then deleted; no question-and-answer history is kept.
No invented decisions.
No invented relationships.
13.4 Cross-resource validation
Dependency relationships are consistent.
Related profiles reference each other.
Resource identifiers are consistent.
Platform architecture agrees with resource profiles.
Glossary terminology is consistent.
Knowledge Graph relationships match the APPROVED profiles (Job 2 only).
13.5 Chat Service validation
Test:

What questions.
Why questions.
How questions.
Where questions.
Which questions.
Who questions.
Dependency questions.
Architecture questions.
Security questions.
Troubleshooting questions.
Impact analysis questions.
Comparison questions.
Test both individual-resource and multi-resource questions.

Raise a gap asking for the knowledge each unsupported platform question needs. Questions requiring domain-team inventories or live resource contents are outside the declared setup and do not create a gap.

14. Synthesis Report
Generate:

`reviews\shared\guides\review\synthesis_report.md`

Include:

Source Analysis
Total source files indexed across all scans.
Files discovered in this scan.
Files successfully read in this scan.
Files unchanged and reused from the source index.
Failed files.
Skipped files and reasons.
Repositories analysed.
Source categories analysed.
Resource Discovery
Resource types identified.
Resource instances identified.
Profiles generated.
Profiles updated.
Profiles requiring review.
Knowledge Synthesis
Evidence records extracted.
Facts consolidated.
Relationships identified.
Decisions identified.
Known errors identified.
Procedures identified.
Quality Assessment
Source references.
Unresolved gaps.
Missing evidence.
Validation failures.
Review Results
Structural validation.
Evidence validation.
Semantic validation.
Cross-resource validation.
Chat question coverage.
Guide status (DRAFT, VERIFIED or APPROVED) per guide, as defined in section 7.4.
Open gap counts and question-file links grouped by review folder and resource or decision topic, so human review can proceed one topic at a time. Preserve actual source attribution in the index.
15. Generation Safety and Status
Guide status follows section 7.4. Job 2 graph and ontology content is generated only when all guides are APPROVED.

The generation engine may:

Read source files.
Analyse information.
Create draft knowledge profiles.
Create draft glossary.
Create draft decisions.
Generate review gaps.
Run validation.
Produce reports.

Job 2 may create graph data and ontology data only after every guide is APPROVED. Do not create graph or ontology files during Job 1.
The job ends after the reviewed content, review reports, Knowledge Graph and Ontology files have been created and validated. There is no publishing step or publication approval to request.
The generation engine MUST NOT:

Change this schema without explicit approval.
Change its generation instructions independently.
Modify source file contents. The only permitted source-file operation is moving successfully processed input files into `scaned_sources\` as specified in section 2.2; do not edit their contents.
Publish, deploy or upload generated knowledge to any service.
Write factual content that has neither source evidence nor a user confirmed answer, or assign any other fact/evidence state.
Silently resolve conflicting evidence.
Close human review gaps without sufficient evidence or a human answer.
Delete previously generated guides.

16. Final Acceptance Criteria
The generation process is successful only when:

All source files discovered in the current scan are accounted for.
All indexed source evidence has been analysed at least once; incremental scans analyse changed/new files and reuse indexed evidence for unchanged files.
Information has been consolidated by resource type.
Every generated profile follows this schema.
Every factual statement has source evidence with supporting links or is marked user confirmed from an actual human answer; no third fact/evidence state is allowed.
Resource dependencies are documented.
Architecture is explained.
Terraform implementation is documented where evidence exists.
Security and governance are documented.
Operational and troubleshooting information is consolidated.
Decisions and rationale are traceable.
Knowledge gaps have been investigated.
Every human question has been answered and incorporated, and `review_gaps.md` has been deleted.
Cross-resource references are consistent.
Knowledge Graph and Ontology compatibility is maintained.
Validation reports are generated.
Chat Service question coverage is assessed.
Every guide is APPROVED as defined in section 7.4.
17. Final Objective
Create a comprehensive, evidence-backed and interconnected Azure platform knowledge base organised by resource type.

Every resource profile must provide enough technical, architectural, security, configuration and operational knowledge for the CloudOps Chat Service to:

Explain how Azure resources work.
Explain how the organisation implements them.
Explain why the architecture is designed as it is.
Understand dependencies and integrations.
Answer Terraform questions.
Explain security and governance.
Troubleshoot operational problems.
Analyse the impact of changes.
Answer questions spanning multiple resource types.
Generate editable Azure Draw.io architecture diagrams on demand.
The same APPROVED knowledge must support Azure AI Search, Chat Service, Knowledge Graph, Ontology, Glossary, Decisions and MCP Server.

Knowledge generation must prioritise accuracy, completeness, evidence and consistency over the number of files generated.
-this schema is immutable and copilot must not edit it .
