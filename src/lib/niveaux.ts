// Source unique pour la liste des niveaux, leur nombre d'exercices et leur nom
// affiche. Avant, ces trois informations etaient copiees-collees dans
// index.astro, lecons/index.astro et compte/index.astro : un oubli de mise a
// jour a un seul endroit suffisait a fausser les pourcentages ou le
// deblocage des niveaux, sans aucune erreur visible. Tout passe maintenant
// par ce fichier.

export const ORDRE: string[] = [
  "debutant",
  "intermediaire",
  "confirme",
  "expert",
  "web",
  "algorithmes",
  "donnees",
  "projet",
];

export const TOTAUX_PAR_NIVEAU: Record<string, number> = {
  debutant: 9,
  intermediaire: 9,
  confirme: 9,
  expert: 10,
  web: 8,
  algorithmes: 9,
  donnees: 10,
  projet: 9,
};

export const NOMS_NIVEAUX: Record<string, string> = {
  debutant: "Débutant",
  intermediaire: "Intermédiaire",
  confirme: "Confirmé",
  expert: "Expert",
  web: "Maître",
  algorithmes: "Virtuose",
  donnees: "Champion",
  projet: "Légende",
};

export function progresNiveau(niveauId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`nexora_progres_${niveauId}`) ?? "[]");
  } catch {
    return [];
  }
}

export function niveauComplet(niveauId: string): boolean {
  const total = TOTAUX_PAR_NIVEAU[niveauId];
  return total ? progresNiveau(niveauId).length >= total : false;
}

export function niveauDebloque(niveauId: string): boolean {
  const rang = ORDRE.indexOf(niveauId);
  return rang === 0 || niveauComplet(ORDRE[rang - 1]);
}
