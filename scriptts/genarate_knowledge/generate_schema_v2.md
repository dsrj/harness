Knowledge Generation Schema v2.0
1. Purpose and objectives
This document defines the mandatory knowledge generation standard for the platform knowledge engine.

The engine analyses multiple repositories, source code, configuration files and technical documentation to generate structured, interconnected and evidence-based Markdown knowledge files.

The generated knowledge will be used by:

AI Chat Service
Agentic AI
MCP Server
Knowledge Graph
Ontology and Semantic Model
Azure AI Search
Architecture Assistant
Infrastructure troubleshooting and impact analysis
The primary objective is to enable AI systems to understand the complete platform, not simply retrieve descriptions of individual resources.

The generated knowledge must enable the AI to answer:

What does this resource or component do?
Why does it exist?
How is it implemented?
Why was it implemented this way?
How does it interact with other components?
Which repositories manage it?
What dependencies does it have?
What happens if something changes?
How is it deployed and maintained?
How can an operational problem be investigated?
Which alternative configurations are possible?
What are the technical and architectural consequences of a proposed change?
Knowledge generation must prioritise accuracy, technical depth, source traceability and relationships.

2. Core knowledge generation principles
The engine must follow these principles:

Understand the source before generating knowledge.
Analyse the complete repository structure and relevant code relationships when no file allowlist is configured. If a source has a `files` allowlist, analyse only those files and the relationships visible within them.
Preserve the original technical meaning.
Generate standardised Markdown regardless of source format.
Capture both implementation details and architectural context.
Identify why a particular implementation or configuration exists when evidence supports it.
Discover dependencies within and across repositories.
Identify technical constraints and design trade-offs.
Separate confirmed facts from inferred information.
Never invent undocumented decisions or relationships.
Preserve source references for technical claims.
Generate architecture content for the knowledge graph.
Avoid unnecessary duplication.
Preserve human corrections during future updates.
Generate knowledge suitable for semantic search, graph reasoning and AI retrieval.
The engine must not optimise for short documentation. It must optimise for useful and complete technical understanding.

3. Source discovery and analysis
Analyse only the repositories listed in sources/<audience>/sources.json. If a source entry has a `files` array, the listed repository-relative files are the complete evidence boundary: read only those files and do not infer facts from any omitted file. If `files` is absent, analyse the repository snapshot as before. Do not scan almbrand/cloudops-openai-hub-knowledge-source or use its documents as a source.

3.1 Supported source types
The engine must support:

Terraform files (.tf)
Terraform variables and outputs
Terraform modules
Terraform state files when provided
YAML files
JSON files
GitHub Actions workflows
Python scripts
PowerShell scripts
Existing Markdown files
Confluence exports
Architecture documents
Configuration files
Operational procedures
Technical design documents
Other relevant infrastructure documentation
3.2 Repository analysis
For every repository, identify and understand:

Repository purpose
Business and technical context
Folder structure
Main capabilities
Components and modules
Resource types
Configuration patterns
Inputs and outputs
Deployment workflows
Dependencies
External integrations
Security implementation
Naming conventions
Environment variations
State management
Architectural patterns
Cross-repository relationships
Analyse related files together.

Do not interpret a Terraform resource in isolation when its behaviour depends on variables, locals, modules, providers, data sources or other resources.

3.3 Terraform code understanding
When analysing Terraform, extract:

Resource definitions
Resource addresses
Resource types
Module definitions
Module sources
Input variables
Output values
Local expressions
Data sources
Explicit dependencies
Implicit dependencies
Conditional resources
Dynamic blocks
For_each and count expressions
Provider configurations
Backend configuration
Remote state dependencies
Lifecycle rules
Naming conventions
Resource configurations
Deployment conditions
Environment-specific differences
Understand how the Terraform implementation produces the intended infrastructure behaviour.

Do not assume that a Terraform declaration proves the current deployed state. Distinguish desired configuration from actual infrastructure observations.

3.4 Repository-level understanding
The engine must understand the repository as a complete technical solution.

Identify:

What the repository is responsible for.
Which capabilities it provides.
Which other repositories it interacts with.
Which resources it creates or configures.
Which resources are managed elsewhere.
How deployment is performed.
How configuration is supplied.
What architectural responsibilities belong to this repository.
What responsibilities belong to other repositories.
3.5 File allowlists
A `files` array on a source entry in sources/<audience>/sources.json is an explicit evidence boundary. The generator supplies only those files; do not inspect, cite or infer facts from omitted files. Record a gap when necessary context is outside the allowlist. When `files` is absent, use the complete repository snapshot as before.

4. Knowledge classification
Before generating Markdown, classify extracted information.

4.1 Knowledge types
Use the following classifications:

Repository
Architecture
Component
Azure Resource
Terraform Module
Configuration
Network
Security
Identity and Access
Deployment
Integration
Dependency
Design Decision
Operational Procedure
Troubleshooting
Governance
Business Context
Technical Constraint
A document may contain multiple knowledge categories.

4.2 Flexible resource profiles
The engine must select relevant sections according to the actual source and resource type.

Do not enforce an identical structure for every resource.

Examples:

Azure Firewall

Architecture
Firewall policies
Network routing
Rule collections
Threat protection
DNS configuration
Logging
Dependencies
Security
Troubleshooting
Impact analysis
Azure Virtual WAN

Hub architecture
Hub connections
Spoke connectivity
Routing intent
Route tables
BGP
VPN
ExpressRoute
Firewall integration
Dependencies
Traffic flow
Azure Key Vault

Access control
Managed identities
Secrets
Certificates
Networking
Encryption
Private endpoints
Dependencies
Rotation
Security
GitHub Actions

Workflow triggers
Jobs and steps
Permissions
Secrets
Runner configuration
Terraform execution
Approval processes
Deployment dependencies
Error handling
Terraform modules

Module purpose
Inputs
Outputs
Resources
Dependencies
Provider requirements
Configuration
Lifecycle
State management
Usage examples
Limitations
The engine must create specialised sections when required.

5. Standard Markdown document structure
Every generated knowledge document must follow this common structure.

Optional sections may be omitted when they are genuinely irrelevant or unsupported by the source.

5.1 Metadata
Every document must start with YAML frontmatter.

Required fields:

schema_version
knowledge_id
knowledge_type
title
domain
source
generation_status
review_status
last_updated
Additional fields:

repository
source_files
source_commit
related_repositories
related_knowledge_ids
azure_services
terraform_resources
tags
confidence
owner, when known
environment, when applicable
Knowledge IDs must be unique and stable across updates.

5.2 Identity and overview
Explain:

What the component is.
What it represents.
What it is responsible for.
Where it belongs in the platform.
Which repository manages it.
Which technical domain it belongs to.
What capabilities it provides.
5.3 Purpose and business context
Explain:

Business purpose.
Technical purpose.
Problem being solved.
Intended outcome.
Platform capabilities supported.
Consumers of the component.
Business or operational value, when documented.
Do not invent business requirements.

5.4 Technical implementation
Document:

How the component is implemented.
Terraform resources and modules.
Resource configurations.
Variables and outputs.
Important expressions and conditions.
Input and output relationships.
Configuration behaviour.
Deployment behaviour.
Relevant code examples.
Source file references.
Include technical details that help an engineer understand and troubleshoot the implementation.

5.5 Architecture and system behaviour
Explain:

Architectural role.
Main components.
Component boundaries.
Resource placement.
Communication flows.
Integration points.
Network topology.
Data flows.
Control flows.
Interactions with other services.
Responsibilities of individual components.
Explain not only which resources exist, but how the complete solution works.

5.6 Relationships and dependencies
Identify and document relationships such as:

Depends on
Creates
Configures
Consumes
Connects to
Routes through
Secured by
Managed by
Deployed through
Integrated with
Provides services to
References
Replaces
Related to
For each relationship, identify:

Source entity
Target entity
Relationship type
Technical explanation
Source repository
Evidence
Confidence classification
Do not create relationships based only on naming similarities.

5.7 Design decisions and architectural rationale
This section is mandatory whenever sufficient evidence exists.

Document:

Observed design choices.
Explicitly documented decisions.
Architectural rationale.
Configuration choices.
Technical trade-offs.
Constraints.
Alternative approaches when documented.
Consequences of the chosen implementation.
Reasons for centralisation or decentralisation.
Reasons for integration patterns.
Classify decisions as:

Explicitly documented
Strongly inferred
Weakly inferred
Unknown
Distinguish between what the code does and why the implementation was selected.

Never fabricate an architectural decision.

5.8 Configuration and variations
Document:

Input parameters.
Default values.
Optional configurations.
Environment-specific settings.
Feature flags.
Naming conventions.
Configuration dependencies.
Allowed values.
Configuration limitations.
Differences between deployments.
5.9 Security and governance
Document applicable controls:

RBAC
Managed identities
Access policies
Network security
Encryption
Private endpoints
Azure Policy
Firewall rules
Authentication
Authorisation
Compliance
Governance
Security boundaries
Explain how controls are implemented and which components enforce them.

5.10 Deployment and lifecycle
Document:

Deployment process.
GitHub Actions workflows.
Terraform execution.
Runner configuration.
Approval requirements.
Terraform state.
Dependencies during deployment.
Resource lifecycle.
Upgrade procedures.
Destroy behaviour.
Rollback considerations.
5.11 Operations and troubleshooting
Document:

Operational responsibilities.
Monitoring.
Logging.
Diagnostic settings.
Common failure scenarios.
Known limitations.
Troubleshooting procedures.
Dependencies affecting availability.
Recovery procedures.
Operational considerations.
Only include procedures supported by source material or clearly identified as recommendations.

5.12 Impact analysis
Identify:

Upstream dependencies.
Downstream dependencies.
Affected components.
Affected repositories.
Potential breaking changes.
Security implications.
Availability implications.
Network implications.
Cost implications when evidence exists.
Operational consequences.
Potential blast radius.
Explain the difference between direct impact and indirect impact.

5.13 Limitations and constraints
Document:

Technical limitations.
Architectural constraints.
Platform dependencies.
Configuration restrictions.
Unsupported scenarios.
Scalability considerations.
Known design compromises.
5.14 Knowledge gaps
Identify:

Missing documentation.
Unknown design decisions.
Unclear resource ownership.
Missing dependencies.
Conflicting source information.
verified relationships.
Missing implementation details.
Questions requiring human clarification.
5.15 Source evidence
Every important technical claim must be traceable.

Where available, include:

Repository
File path
Terraform resource address
Line number or line range
Commit SHA
Original document reference
Related knowledge ID
Do not invent source references.

6. Question-answering readiness
This section is critical.

The generated knowledge must support specific technical questions rather than only general summaries.

For every significant component, ensure sufficient information exists to answer the following question categories.

6.1 What questions
What is this resource?
What is its purpose?
What does it create?
What functionality does it provide?
What configuration is applied?
What does this module manage?
6.2 Why questions
Why does this resource exist?
Why is this configuration used?
Why is this architecture designed this way?
Why is this resource deployed in this location?
Why is one approach used instead of another?
What problem does this design solve?
6.3 How questions
How does this resource work?
How is it deployed?
How does it communicate with other resources?
How is access controlled?
How does traffic flow?
How does the configuration affect behaviour?
How can it be modified safely?
6.4 Where questions
Where is this resource defined?
Which repository manages it?
Which Terraform module creates it?
Where is the configuration supplied?
Where are its dependencies defined?
Which subscription or resource group does it belong to, when established?
6.5 Dependency questions
What does this component depend on?
Which components depend on it?
Which repositories are involved?
What happens if a dependency is unavailable?
Which resources are indirectly affected?
6.6 Comparison questions
How do two resources differ?
Which repositories implement similar functionality?
What configuration differences exist?
Which implementation patterns are shared?
Why are two environments configured differently?
6.7 Troubleshooting questions
Why might this resource fail?
What should be checked first?
Which dependencies can cause failure?
Which configuration controls the behaviour?
Which logs or diagnostics are relevant?
Which repository contains the implementation?
6.8 Change and impact questions
What happens if this configuration changes?
Which components might be affected?
What are the dependencies?
What could break?
What security implications exist?
Which repositories might require modification?
The engine must generate enough detailed knowledge to support these question categories wherever the source contains the required information.

It must not generate generic filler answers to satisfy a question category.

7. Architecture content for the knowledge graph
Generate architecture content in Markdown for the knowledge graph, not diagram files.

Describe components and resource types, their containment boundaries, and their relationships, including connection direction, purpose, source evidence, and whether each relationship is confirmed or inferred. Use the existing architecture and relationship sections.

Architecture diagrams are rendered downstream from the knowledge graph, with Azure icons, resource boundaries and connections. This generation stage must not produce Draw.io/XML or Mermaid.

8. Existing documentation conversion
The engine must convert existing documentation into the standard knowledge structure.

This includes existing Markdown files, Confluence exports, YAML, JSON and other supported documents.

8.1 Conversion process
Read and understand the original document.
Identify the technical subject.
Identify knowledge categories.
Extract facts and implementation details.
Extract architectural decisions.
Extract dependencies and relationships.
Identify relevant resource profiles.
Map information to standard Markdown sections.
Preserve original technical examples.
Identify missing and conflicting information.
Extract architecture content for the knowledge graph.
Add standard metadata.
Preserve original source references.
Validate the generated document.
Mark the document as pending human review.
8.2 Information preservation
Never discard useful technical information.
Never remove important configuration details.
Preserve code examples where relevant.
Preserve original explanations when technically valid.
Consolidate duplicated information carefully.
Flag contradictions rather than silently choosing one version.
Keep the original source traceable.
Do not invent missing explanations.
The standard structure must adapt to the information, not force the information into an unsuitable structure.

9. Cross-repository understanding
The engine must analyse all available repositories as parts of one platform.

Identify:

Shared modules.
Shared resources.
Common configurations.
Repository dependencies.
Deployment relationships.
Architectural patterns.
Shared services.
Centralised platform capabilities.
Integration boundaries.
Ownership boundaries.
Upstream and downstream dependencies.
Generate cross-repository knowledge where relationships exist.

When analysing a component, the engine should consider related repositories before concluding that information is missing.

Cross-repository references must use stable knowledge identifiers and repository names.

10. Facts, inference, confidence and conflicts
Every important extracted statement must have an appropriate evidence classification.

FACT
Directly established by source code, configuration or authoritative documentation.

INFERENCE
A technical conclusion derived from available evidence.

UNKNOWN
Information that cannot be established.

CONFLICT
Contradictory information exists between sources.

CONFIDENCE
Use:

High
Medium
Low
Confidence must reflect the strength and completeness of the evidence.

An inferred statement must never be represented as a confirmed fact.

Conflicting sources must be highlighted for human review.

11. Knowledge graph readiness
The Markdown output must support future knowledge graph and ontology generation.

Every relevant entity must have:

Stable identifier
Canonical name
Entity type
Domain
Description
Source reference
Related entities
Confidence
Review status
Every relationship must have:

Source entity
Target entity
Relationship type
Description
Evidence
Confidence
Use consistent entity naming and relationship terminology.

Avoid creating multiple entities for the same resource because of naming differences.

The knowledge generation engine must not independently invent ontology structures. The downstream knowledge processing pipeline will map approved knowledge to the defined ontology and semantic model.

12. Human review and approval
All generated Markdown files must initially use:

generation_status: ai_generated

review_status: pending

Human reviewers must be able to:

Correct technical facts.
Add missing context.
Validate design decisions.
Correct relationships.
Review architecture content for the knowledge graph.
Resolve conflicts.
Add operational knowledge.
Confirm ownership.
Approve documents for publication.
Human corrections must be preserved during future updates.

The engine must not overwrite approved human knowledge without identifying the affected changes.

Unapproved knowledge must not be published as approved knowledge.

13. Validation requirements
Before generating final Markdown files, validate:

Required metadata exists.
Knowledge IDs are unique.
Resource types are correctly identified.
Technical statements have evidence.
Relationships have valid source and target entities.
Inferences are correctly classified.
Conflicts are identified.
Relevant sections are populated.
Irrelevant sections are not forced.
Original information is preserved.
Architecture content corresponds to extracted components, boundaries and relationships.
Cross-repository references are valid.
Human review status is correctly assigned.
Incomplete knowledge must be explicitly identified rather than silently omitted.

14. Knowledge completeness
The engine must assess whether the generated document contains sufficient information to support technical understanding.

Assess these dimensions:

Identity and purpose
Technical implementation
Architecture and behaviour
Relationships and dependencies
Design decisions
Configuration
Security
Deployment
Operations
Impact analysis
Source evidence
Classify completeness as:

Complete: Relevant information is adequately supported.
Partially complete: Some relevant information is missing.
Insufficient: Important information cannot be established.
Completeness must not be confused with confidence.

A technically accurate document may still be incomplete.

15. Future update and version management
The knowledge generation engine must support incremental updates.

When source repositories change:

Identify changed files.
Identify affected knowledge documents.
Reanalyse relevant dependencies.
Identify affected architecture content.
Preserve approved human corrections.
Compare new and previous knowledge.
Identify removed or changed resources.
Identify new relationships.
Flag potentially outdated information.
Keep changes in the affected knowledge documents; do not create a separate change-summary file.
Do not regenerate every document unnecessarily when only a small part of a repository changes.

Maintain source commit references to establish which version of the source produced the knowledge.

Do not create design-topic question files. The generator may maintain manifest.json only as operational state required for incremental updates and validation; it is not a knowledge document and must not be created by Copilot.

16. Final generation objective
The final generated Markdown files must represent a reliable technical understanding of the platform.

They must provide enough structured information for AI systems to:

Explain individual Azure resources and Terraform implementations.
Explain how complete platform components work.
Explain why architectural choices were made when evidence exists.
Understand relationships across repositories.
Identify dependencies and technical constraints.
Compare implementations.
Troubleshoot infrastructure problems.
Explain the consequences of configuration changes.
Support architecture diagrams rendered from the knowledge graph.
Support knowledge graph reasoning.
Retrieve precise information through Azure AI Search.
Provide contextual and technically accurate answers through Chat Service, MCP and Agentic AI.
The quality of generated knowledge must be measured by the accuracy, specificity and completeness of the technical questions it can answer, not by the number or length of Markdown files generated.

17. Quality requirements
Write for platform engineers and for an AI assistant that answers their questions from these documents:
- Be specific: use the real names, values, variables, resource types, SKUs, address ranges, paths, workflow and job names, inputs and outputs from the sources. Use tables for inventories, settings and mappings, and short code excerpts where they help.
- Explain why and how, not only what: purpose, behaviour, dependencies, impact of change, failure modes and how to fix them.
- Make every section and answer understandable on its own, because documents are split into chunks for retrieval.
- No generic Azure or Terraform explanations, marketing text, filler or repetition. Say nothing rather than something vague.
- Before you finish, reread each document against the schema and these instructions, and fix anything missing or wrong.
- always ask for approval before adding your own instructions.
- do not add instructions on your own
- always use github copilot to generate md files in this repo.
- do not keep legacy unused items . always suggest to delete ununsed  files or folders.

-this schema is immutable and copilot must not edit it .
