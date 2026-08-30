# Freight & Carrier Context

Reference for an agent that queries the Nauti carrier directory. Explains the standard freight terminology used in the `type` and `agent_summary` fields, and how the carrier base is organized.

## Transport modes and standard terms

These are standard, industry-wide terms (used globally in logistics, freight forwarding and shipping):

### Land (terrestre)
- **FTL — Full Truckload** (*carga masiva / viaje completo*): one shipper's cargo fills the whole truck. Priced per trip. Cheapest per ton for large volumes; fastest transit (no intermediate stops).
- **LTL — Less Than Truckload** (*paqueteo / carga consolidada*): the truck carries several shippers' cargo, consolidated at cross-dock hubs. Priced per kilo/pallet. Cheaper for partial loads (< ~10–12 t), slower transit.
- **Courier / last-mile** (*mensajería / última milla*): parcels and small freight, branch networks, home/store delivery. Priced per package.
- **Reefer** (*refrigerado / cadena de frío*): temperature-controlled trailers for food and pharma. Typically 15–25% premium over dry van.
- **Flatbed / project cargo** (*planchón / carga extradimensionada*): open trailers for steel, machinery, oversized loads; may need escorts and permits.
- **Tanker** (*carga líquida*): liquid bulk — fuels, chemicals, food-grade liquids. Often involves hazmat certification.
- **Drayage** (*acarreo portuario*): short-haul container moves between a port and a nearby yard/warehouse, using chassis. In Colombia mostly around Buenaventura, Cartagena and Barranquilla.

### Ocean (marítimo)
- **FCL — Full Container Load**: the shipper books an entire container (20ft/40ft/40HC). Priced per container.
- **LCL — Less than Container Load** (*carga suelta consolidada*): cargo shares a container assembled by a consolidator/forwarder. Priced per m³ or ton.
- **Naviera / ocean carrier**: the shipping line operating vessels (Maersk, MSC, Hapag-Lloyd, CMA CGM, COSCO, ONE, Evergreen, HMM, ZIM, Yang Ming). Ranked by capacity: MSC > Maersk ≈ CMA CGM > COSCO > Hapag-Lloyd > ONE > Evergreen > HMM ≈ ZIM ≈ Yang Ming.
- Key ocean-negotiation levers: base freight, **demurrage/detention free days**, equipment guarantees, spot vs contract rates, carrier haulage (line handles inland) vs merchant haulage (shipper arranges inland).

### Air (aéreo)
- **Air cargo**: belly capacity in passenger aircraft or dedicated freighters. Priced per chargeable kilo (max of actual vs volumetric weight). ~10x ocean cost; used for urgent, perishable or high-value freight. In Colombia: Avianca Cargo, LATAM Cargo; flowers to Miami dominate seasonal capacity (Valentine's / Mother's Day spikes).

### Intermediaries and services
- **Freight forwarder** (*agente de carga*): doesn't own trucks/vessels; buys capacity from carriers and resells door-to-door. Adds convenience and consolidation, marks up rates. Negotiation lever: ask them to break out ocean freight, local charges and inland legs separately.
- **Customs broker** (*agencia de aduanas*): licensed agency filing import/export declarations, tariff classification, DIAN compliance. In Colombia, level-1 agencies (*nivel 1*) handle the largest operations. Fees are per-declaration; negotiable to flat monthly above ~10 declarations.
- **3PL** (*operador logístico*): outsourced warehousing + distribution + transport under one contract.
- **OEA / CTPAT**: security certifications (Operador Económico Autorizado / Customs-Trade Partnership) that speed up customs and signal reliability.

## Geography of this carrier base

The directory is **Colombia-centered**: domestic land lanes between Bogotá (BOG), Medellín (MDE), Cali (CLO), Cartagena (CTG), Barranquilla (BAQ) and the port of Buenaventura (BUN). Route codes follow `ORIGIN-DEST` (e.g. `BOG-MDE`). Legacy Mexican codes (`CDMX-*`, `MTY-*`) exist from earlier data.

- **Ports**: Buenaventura (Pacific — Asia trades), Cartagena (Caribbean — Europe/US/transshipment hub), Barranquilla (Caribbean, river port).
- **Ocean lines** listed also operate Mexican ports (Manzanillo, Veracruz, Altamira, Lázaro Cárdenas) for cross-market operations.

## The carrier mix (27 carriers)

| Segment | `type` label | Carriers |
|---|---|---|
| LTL / paqueteo / courier (CO) | `LTL / …`, `Last-mile / …` | Coordinadora, Servientrega, TCC, Envia (Colvanes), Saferbo, Interrapidisimo |
| FTL / carga masiva (CO) | `FTL / …` | Ditransa, Botero Soto, Icoltrans, Transportes Vigia (refrigerado), Coltanques (carga líquida) |
| Air | `Air cargo …` | Deprisa (Avianca courier), Avianca Cargo |
| Ocean lines | `Marítimo` (pure vessel operators) | MSC Colombia, Hapag-Lloyd, ONE, COSCO Shipping, Evergreen, HMM, ZIM, Yang Ming |
| Ocean + inland logistics | `Marítimo + logística` (line also sells inland/door services) | Maersk, CMA CGM |
| Forwarders / 3PL | `Freight forwarder …` | Blu Logistics, Coltrans (LCL), DHL Global Forwarding |
| Customs | `Agenciamiento aduanero` | Agencia de Aduanas Roldan |

## How the agent should use this

- The `type` field tells you which mode and pricing unit applies (per trip, per kilo, per container, per chargeable kilo, per declaration).
- The `agent_summary` carries a **negotiation angle** per carrier — a concrete lever (backhaul discounts, spot vs contract, free days, corporate tariffs, competitor pressure).
- Match carriers to a request by mode first (does the load need a truck, a container, a plane, or a customs filing?), then by lane (`supported_routes`), then use the negotiation angle in the conversation.
- Rules of thumb: LTL below ~10 t, FTL above; ocean for non-urgent international; air only for urgent/perishable/high-value; always compare a forwarder's quote against going direct to the line.
