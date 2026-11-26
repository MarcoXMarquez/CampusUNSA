export type CampusId = "engineering" | "biomedical" | "social";
type Coordinates = readonly [latitude: number, longitude: number];

export const CAMPUSES = {
  engineering: { name: "Ingenierías", address: "Av. Independencia s/n", point: [-16.405455, -71.524754] },
  biomedical: { name: "Biomédicas", address: "Av. Daniel Alcides Carrión s/n", point: [-16.413372, -71.533778] },
  social: { name: "Sociales", address: "Av. Venezuela s/n", point: [-16.406257, -71.521471] },
} as const satisfies Record<CampusId, { name: string; address: string; point: Coordinates }>;

export interface School {
  id: string;
  name: string;
  faculty: string;
  campus: CampusId | null;
  address: string;
  point?: Coordinates;
  aliases?: string;
}

type SchoolEntry = readonly [id: string, name: string, address?: string, point?: Coordinates, aliases?: string];

function schools(faculty: string, campus: CampusId, entries: readonly SchoolEntry[]): School[] {
  return entries.map(([id, name, address = CAMPUSES[campus].address, point, aliases]) => ({
    id, name, faculty, campus, address, point, aliases,
  }));
}

export const SCHOOLS: readonly School[] = [
  ...schools("Arquitectura y Urbanismo", "engineering", [
    ["architecture", "Arquitectura", "Facultad de Arquitectura y Urbanismo · ingreso por Av. Venezuela", [-16.405701, -71.524245]],
  ]),
  ...schools("Ciencias Naturales y Formales", "engineering", [
    ["physics", "Física", "Pabellón de Física · Av. Independencia"],
    ["mathematics", "Matemáticas", "Pabellón de Matemáticas · Av. Independencia", [-16.40374, -71.524209], "Matemática"],
    ["chemistry", "Química", "Pabellón de Química · Av. Independencia"],
  ]),
  ...schools("Geología, Geofísica y Minas", "engineering", [
    ["geology", "Ingeniería Geológica", "Edificio antiguo · Av. Independencia con calle Paucarpata"],
    ["geophysics", "Ingeniería Geofísica", "Edificio antiguo · Av. Independencia con calle Paucarpata"],
    ["mining", "Ingeniería de Minas", "Edificio antiguo · Av. Independencia con calle Paucarpata"],
  ]),
  ...schools("Ingeniería Civil", "engineering", [
    ["civil", "Ingeniería Civil", "Pabellón de Ingeniería Civil · Av. Independencia", [-16.404138, -71.526628]],
    ["sanitary", "Ingeniería Sanitaria", "Pabellón de Ingeniería Civil · Av. Independencia", [-16.404138, -71.526628]],
  ]),
  ...schools("Ingeniería de Procesos", "engineering", [
    ["chemical", "Ingeniería Química", "Pabellón de Ingeniería Química · Av. Independencia", [-16.404101, -71.52538]],
    ["environmental", "Ingeniería Ambiental", "Edificio Antonio Raimondi · Av. Independencia"],
    ["materials", "Ingeniería de Materiales", "Pabellón de Ingeniería de Materiales · Av. Independencia"],
    ["metallurgy", "Ingeniería Metalúrgica", "Pabellón de Ingeniería Metalúrgica · Av. Independencia"],
    ["food", "Ingeniería de Industrias Alimentarias", "Av. Independencia con calle Paucarpata"],
  ]),
  ...schools("Ingeniería de Producción y Servicios", "engineering", [
    ["systems", "Ingeniería de Sistemas", "Av. Independencia con calle Paucarpata", [-16.406491, -71.52489], "EPIS"],
    ["electrical", "Ingeniería Eléctrica", "Pabellón de Ingeniería Eléctrica", [-16.404274, -71.526037]],
    ["electronics", "Ingeniería Electrónica", "Pabellón de Ingeniería Electrónica · Av. Venezuela", [-16.40667, -71.524352]],
    ["mechanical", "Ingeniería Mecánica", "Pabellón Pedro Paulet · Av. Independencia"],
    ["industrial", "Ingeniería Industrial", "Pabellón de Ingeniería Industrial", [-16.403288, -71.524806]],
    ["computing", "Ciencia de la Computación", "Pabellón de Computación · Av. Venezuela", undefined, "Ciencias de la Computación EPCC"],
    ["telecommunications", "Ingeniería de Telecomunicaciones", "Pabellón de Telecomunicaciones · Av. Venezuela"],
  ]),
  ...schools("Administración", "engineering", [
    ["administration", "Administración", "Pabellón de Administración · Av. Venezuela 400"],
    ["banking", "Banca y Seguros", "Pabellón de Administración · Av. Venezuela"],
    ["marketing", "Marketing", "Pabellón de Administración · Av. Venezuela"],
    ["management", "Gestión", "Pabellón de Administración · Av. Venezuela 400", undefined, "Gestión Pública Gestión de Empresas Gestión de Proyectos"],
  ]),
  ...schools("Filosofía y Humanidades", "engineering", [
    ["philosophy", "Filosofía", "Pabellón de Filosofía y Humanidades · Av. Independencia"],
    ["literature", "Literatura y Lingüística", "Pabellón de Filosofía y Humanidades · Av. Independencia"],
    ["arts", "Artes", "Pabellón de la Escuela de Artes · ingreso por Av. Venezuela", undefined, "Artes Plásticas Música"],
  ]),
  ...schools("Ciencias Biológicas", "biomedical", [
    ["biology", "Biología", "Pabellón de Biología · Av. Alcides Carrión", [-16.413972, -71.534127]],
    ["nutrition", "Ciencias de la Nutrición", "Pabellón de Nutrición · Av. Alcides Carrión"],
    ["fisheries", "Ingeniería Pesquera", "Pabellón de Ingeniería Pesquera · Av. Alcides Carrión"],
  ]),
  ...schools("Medicina", "biomedical", [
    ["medicine", "Medicina", "Facultad de Medicina · Av. Alcides Carrión", [-16.412493, -71.534655]],
  ]),
  ...schools("Enfermería", "biomedical", [
    ["nursing", "Enfermería", "Pabellón administrativo · Av. Alcides Carrión 501 B"],
  ]),
  {
    id: "agronomy",
    name: "Agronomía",
    faculty: "Agronomía",
    campus: null,
    address: "Urb. Aurora s/n · al costado del Estadio UNSA",
    aliases: "Ingeniería Agronómica",
  },
  ...schools("Ciencias Contables y Financieras", "social", [
    ["accounting", "Contabilidad", "Pabellón de Ciencias Contables y Financieras · Av. Venezuela"],
    ["finance", "Finanzas", "Pabellón de Ciencias Contables y Financieras · Av. Venezuela"],
  ]),
  ...schools("Ciencias Histórico Sociales", "social", [
    ["social-work", "Trabajo Social", "Pabellón de Sociales · Av. Venezuela"],
    ["anthropology", "Antropología", "Pabellón de Sociales · Av. Venezuela"],
    ["tourism", "Turismo y Hotelería", "Pabellón de Sociales · Av. Venezuela"],
    ["sociology", "Sociología", "Pabellón de Sociales · Av. Venezuela"],
    ["history", "Historia", "Pabellón de Sociales · Av. Venezuela"],
  ]),
  ...schools("Economía", "social", [
    ["economics", "Economía", "Pabellón de Economía · Av. Venezuela"],
  ]),
  ...schools("Derecho", "social", [
    ["law", "Derecho", "Pabellón principal de Derecho · Av. Venezuela"],
  ]),
  ...schools("Ciencias de la Educación", "social", [
    ["basic-education", "Educación Básica Integral", "Facultad de Ciencias de la Educación · Av. Venezuela", [-16.40855, -71.520652], "Educación Física Educación Inicial Educación Primaria"],
    ["science-education", "Ciencias y Tecnología", "Facultad de Ciencias de la Educación · Av. Venezuela", [-16.40855, -71.520652], "Ciencias Naturales Informática Educativa Físico Matemática"],
    ["humanities-education", "Humanidades y Letras", "Facultad de Ciencias de la Educación · Av. Venezuela", [-16.40855, -71.520652], "Ciencias Sociales Lengua Literatura Filosofía Psicología Idiomas Inglés Francés"],
  ]),
  ...schools("Psicología, Relaciones Industriales y Ciencias de la Comunicación", "social", [
    ["psychology", "Psicología", "Pabellón de Psicología, Relaciones Industriales y Comunicación · Av. Venezuela", [-16.406611, -71.519188]],
    ["industrial-relations", "Relaciones Industriales", "Pabellón de Psicología, Relaciones Industriales y Comunicación · Av. Venezuela", [-16.406611, -71.519188]],
    ["communications", "Ciencias de la Comunicación", "Pabellón de Psicología, Relaciones Industriales y Comunicación · Av. Venezuela", [-16.406611, -71.519188], "Periodismo Relaciones Públicas"],
  ]),
].sort((first, second) => first.name.localeCompare(second.name, "es-PE"));

export interface MapSelection {
  label: string;
  point: Coordinates;
  campus?: CampusId;
}
