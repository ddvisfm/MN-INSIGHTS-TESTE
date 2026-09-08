import type { ThesisSlug } from './shared/types.js';

export interface AgencyBaseClient {
  code: string;
  name: string;
  thesisSlugs: ThesisSlug[];
}

// Carga inicial derivada da planilha operacional fornecida em 06/09/2026.
// Somente clientes ATIVOS com ao menos uma campanha de tese em status Rodando foram incluídos.
export const AGENCY_BASE_CLIENTS: AgencyBaseClient[] = [
  { code: "MN001", name: "Lucas Cruz", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN027", name: "Jaqueline Rossoni", thesisSlugs: ["bpc-pessoa-com-deficiencia", "bpc-transtornos-mentais"] },
  { code: "MN035", name: "Priscilla Porto", thesisSlugs: ["bpc-transtornos-mentais", "beneficio-por-incapacidade"] },
  { code: "MN043", name: "Edineude Libarino", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN046", name: "Rosana Maria (Nito)", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN053", name: "Adeilson Andrade", thesisSlugs: ["bpc-transtornos-mentais", "auxilio-acidente"] },
  { code: "MN054", name: "Cloves Caju", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN060", name: "Walace Saraiva", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN065", name: "Thays Karine", thesisSlugs: ["auxilio-acidente"] },
  { code: "MN077", name: "Janaina Balbino", thesisSlugs: ["bpc-tdah", "bpc-pessoa-com-deficiencia"] },
  { code: "MN078", name: "Eduardo Almeida", thesisSlugs: ["bpc-pessoa-com-deficiencia"] },
  { code: "MN079", name: "Carolina Maluf", thesisSlugs: ["aposentadoria-pcd"] },
  { code: "MN084", name: "Aildison Costa", thesisSlugs: ["salario-maternidade"] },
  { code: "MN091", name: "Edisio Bezerra", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN094", name: "Nadson Dias", thesisSlugs: ["bpc-pessoa-com-deficiencia"] },
  { code: "MN096", name: "Thalyta de Castro", thesisSlugs: ["segundo-salario-maternidade"] },
  { code: "MN099", name: "Camila Muriele", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN103", name: "Múcio Santos", thesisSlugs: ["bpc-autismo"] },
  { code: "MN106", name: "Samara Pereira", thesisSlugs: ["salario-maternidade", "bpc-transtornos-mentais"] },
  { code: "MN110", name: "Erica Brito", thesisSlugs: ["salario-maternidade"] },
  { code: "MN112", name: "Alessandro Del Nero", thesisSlugs: ["auxilio-acidente"] },
  { code: "MN116", name: "Aristides Sampaio", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN121", name: "Sócrates Aleixo", thesisSlugs: ["auxilio-acidente", "aposentadoria-professor"] },
  { code: "MN126", name: "Carina Alves", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN128", name: "Daniel Pereira", thesisSlugs: ["auxilio-acidente"] },
  { code: "MN129", name: "Ginara Rosa", thesisSlugs: ["bpc-pessoa-com-deficiencia"] },
  { code: "MN137", name: "Helia Maria", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN139", name: "Hugo Coriolano", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN140", name: "Manuela Delgado", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN141", name: "Ingrid Lomanto", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN142", name: "Edson Isaac", thesisSlugs: ["auxilio-acidente"] },
  { code: "MN143", name: "Christine Pinho", thesisSlugs: ["auxilio-acidente"] },
  { code: "MN144", name: "Loyana  Lucas", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN147", name: "Mariana", thesisSlugs: ["beneficio-por-incapacidade", "auxilio-acidente"] },
  { code: "MN148", name: "Lázaro Mendonça", thesisSlugs: ["bpc-pessoa-com-deficiencia"] },
  { code: "MN150", name: "Rodrigo Ewerton", thesisSlugs: ["bpc-autismo"] },
  { code: "MN151", name: "Aldenor", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN155", name: "Ana Clara", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN156", name: "João Lima", thesisSlugs: ["bpc-pessoa-com-deficiencia"] },
  { code: "MN159", name: "Tiffany Fontes", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN163", name: "Maria Cavalcanti", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN169", name: "Victor Santos", thesisSlugs: ["bpc-transtornos-mentais"] },
  { code: "MN175", name: "Erica Dandara", thesisSlugs: ["bpc-transtornos-mentais"] },
];
