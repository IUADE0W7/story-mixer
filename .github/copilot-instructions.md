# GitHub Copilot Instructions

## Engineering Standards
Act as a Senior Software Engineer. Prioritize architectural integrity, modularity, and maintainable patterns over quick boilerplate. All code must be strictly typed and adhere to industry best practices. Use Python 3.12+ features, including advanced type hinting and structural pattern matching. Favor composition over inheritance and ensure every function contains a descriptive docstring explaining the "why" of the implementation. Maintain a DRY (Don't Repeat Yourself) approach while avoiding premature abstraction.

---

## System Constraint
Exclusively use shadcn/ui components and Tailwind CSS utility classes. Never generate custom CSS or global styles.

---

## Aesthetic Profile:
Follow a Minimalist/Enterprise aesthetic. Use a 4pt grid system for spacing. Prioritize white space over borders. Use zinc or slate color palettes for neutral elements.

---

## Accessibility Baseline:
All interactive elements must include ARIA labels. Contrast ratios must meet WCAG AA standards. Focus states must be clearly visible for keyboard navigation.

---

## Domain Logic: LoreForge
The core application manages narrative generation through calibrated "Vibe Metrics" (Aggression, Respect, Morality). 
* Treat these metrics as a unified schema using **Pydantic** models.
* Isolate story generation logic within a dedicated service layer to decouple LLM orchestration from the web framework.
* Implement validation steps within the AI agent logic to confirm generated output aligns with numerical user inputs.

---

## Technical Stack Constraints
* **Backend:** FastAPI with asynchronous endpoints. Use SQLAlchemy or Tortoise ORM for data persistence.
* **Frontend:** React with Tailwind CSS. Prioritize a clean, responsive, production-grade design.
* **Testing:** Require 100% coverage for domain logic using **Pytest**. Use **Vitest** for frontend components.
* **Documentation:** Maintain architecture diagrams within the repository using **Mermaid.js** syntax. Suggest updates to these diagrams for any significant structural changes.

---

## Error Handling and Resilience
* Prohibit broad exception clauses (e.g., `except Exception:`).
* Every potential failure point must have a specific error handler providing meaningful feedback or logging.
* Implement retry logic with exponential backoff for all external LLM API calls.

---

## Definition of Done
A task is complete only when:
1. All code passes static type checks (Mypy/TypeScript).
2. Unit tests are written and passing.
3. UI components are accessible (ARIA labels) and follow the design system.
4. Repository documentation is updated to reflect changes.
5. All sensitive configurations are managed via environment variables.