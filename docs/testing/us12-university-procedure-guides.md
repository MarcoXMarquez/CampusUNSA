# US-12 university procedure guides

Issue [#12](https://github.com/MarcoXMarquez/CampusUNSA/issues/12) implements
REQ-20. Students open **Hugo**, select the procedure guide, and navigate a
procedure with numbered steps, Previous, Next, and Finish. Each open step
receives keyboard focus and the current step is exposed through `aria-current`.
The guide content is bundled with the application, so a loaded section remains
readable offline. Official external forms and services require internet access.

## Source verification

Reviewed against UNSA sources on November 24, 2026. The scope is undergraduate
procedures. Update the catalog and this record together when a new calendar,
directive, or form replaces a source.

| Guide | Official evidence and scope |
| --- | --- |
| Course withdrawal | [DSA withdrawal procedure](https://vra.unsa.edu.pe/dsa/procedimientos/retiro-de-matricula-modificacion-de-matricula/) provides the previous enrollment certificate, payment receipt, modification charge of S/ 10.00, and its linked enrollment form. [RCU 0999-2025](https://transparencia.unsa.edu.pe/handle/123456789/1727), PDF page 4, sets August 10–21, 2026 for school-level modification and withdrawal in term 2026-B. [Exceptional withdrawal](https://vra.unsa.edu.pe/dsa/procedimientos/retiro-excepcional/) is a separate DSA procedure. |
| Enrollment rectification | [DSA regular enrollment procedure](https://vra.unsa.edu.pe/dsa/procedimientos/matricula-regular/), step 8, names the school, signed form, enrollment certificate, receipt, and [UNSAPay](https://ouis.unsa.edu.pe/unsapay) code flow. Use the 2026-B window from RCU 0999-2025 rather than the 2026-A dates on the procedural page. |
| Fee waiver | [RCU 124-2018](https://transparencia.unsa.edu.pe/handle/123456789/412), PDF page 2, covers incoming undergraduates from national schools and a socioeconomic assessment before a total or partial recommendation. [RCU 0998-2025](https://transparencia.unsa.edu.pe/handle/123456789/1734) establishes the socioeconomic study directive. Request current forms and deadlines from [University Welfare](https://www.unsa.edu.pe/bienestaruniversitario/nosotros/). The catalog does not publish a universal waiver, payment code, or intake deadline. |
| Library access | [UNSA library user regulations](https://fips.unsa.edu.pe/ingenieriadesistemas/wp-content/uploads/sites/2/2021/08/REGLAMENTO-USUARIOS-SISTEMA-BIBLIOTECAS-UNSA.pdf), articles 16–17, cover the catalog, ordinary user registration and free database service subject to conditions. The [official library landing page](https://fggm.unsa.edu.pe/inggeofisica/biblioteca-virtual/) lists electronic resources and provider registration instructions. |

The payment code is generated in UNSAPay using the student's institution account
and selected concept. The catalog supplies the concept and official link. The
published term window is historical as of the review date. Current exceptions
and later windows are controlled by the relevant UNSA school, not by the app.
The withdrawal guide includes both the form URL published by the DSA and its
source page for cases where the direct download is unavailable.

## Data contract

`frontend/src/lib/messages/academic-procedures.es-PE.json` contains the Spanish
guide content. `academic-procedures.schema.json` defines the JSON structure.
Each guide defines `id`, `title`, `summary`, `steps`, `prerequisites`, `forms`
and `sources`. Steps may contain official HTTPS links. Form links are displayed
in the form step. Eligibility details stay under prerequisites. Component text
lives in `procedure-guide-messages.ts`.

## Design review

| Component | Context and function | Surface and elevation | Interaction |
| --- | --- | --- | --- |
| Hugo guide launcher | Inline selectable entry under the Hugo title | E0 card, subtle boundary, rounded group, no shadow or bevel | Existing interactive surface, minimum 44 px target, keyboard focus restored on return |
| Procedure catalog | Selectable rows in a single grouped list on the canvas | E0 card and inset separators, no shadow or bevel | Wraps titles and clamps long summaries, with standard focus and pressed states |
| Step navigation | Numbered controls in normal flow | E0 controls, current step uses inset fill and a control border, no shadow or bevel | Current step announced with `aria-current`, keyboard and touch controls, wraps on narrow screens |
| Step content and official sources | In-flow reading and official links | E0 cards with subtle boundaries, rounded group, no shadow or bevel | Headings receive focus on navigation and source links stay individually reachable |

Source: `docs/design/DESIGN.md`, palette and Dynamic Type mapping, and the
ordinary in-flow E0 rule of `docs/design/surface-elevation-guideline.md`.
The existing Hugo header, app canvas, and dock follow the same design system.
No layout or material exception is needed. The guide has a bundled source
instead of a network lookup. Offline and empty behavior are local to the guide.
Authentication and network-derived errors remain with the existing app shell.

## Verification

```bash
cd frontend
npm run test -- src/components/views/ProcedureGuide.test.tsx
npx tsc --noEmit
npm run test:e2e -- e2e/procedure-guide.spec.ts
# From repository root:
node scripts/verify-ui-directives.mjs
./scripts/verify.sh
```

The browser suite starts from the authenticated Hugo tab, opens the guide,
walks through withdrawal requirements, dates, payment and forms, and checks
mobile overflow and focus navigation. The unit suite covers all four entries,
offline reading, navigation boundaries and reset behavior.
