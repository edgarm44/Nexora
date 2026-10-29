// Moteur d'exercices partagé par toutes les pages de leçons.
// Un seul endroit à corriger si un bug apparaît sur n'importe quel niveau.

export type TypeExercice = "qcm" | "completer" | "ecrire" | "code" | "html";

export interface Unite {
  id: string;
  titre: string;
  explication: string; // HTML
  exemple: string[]; // blocs de code de l'exemple (chaque entrée = un bloc, \n pour plusieurs lignes)
  consigne: string;
  code?: string[]; // blocs de code affichés avec la consigne
  type: TypeExercice;
  options?: string[];
  bonneOption?: number;
  reponsesValides?: RegExp;
  placeholder?: string;
  indiceErreur?: string;
  codeDepart?: string; // pour le type "code"
  sortieAttendue?: RegExp;
  indiceCode?: string;
  regexHtml?: RegExp; // pour le type "html" : vérifie le code source tapé, pas une sortie exécutée
  indiceHtml?: string;
  explicationReponse?: string; // affiché après la bonne réponse, pour détailler le pourquoi
}

export interface OptionsMoteur {
  unites: Unite[];
  cleProgres: string;
  corpsId: string;
  progressionId: string;
  base: string;
  titreFin: string;
  texteFin: string;
  retourHref: string;
  hrefRevoir?: string; // par defaut, deduit de cleProgres sous /lecons/<niveau>/
}

declare global {
  interface Window {
    loadPyodide?: (opts?: any) => Promise<any>;
  }
}

let pyodideInstance: any = null;
let pyodideChargement: Promise<any> | null = null;

function chargerPyodide() {
  if (!pyodideChargement) {
    pyodideChargement = window.loadPyodide!().then((p: any) => {
      pyodideInstance = p;
      return p;
    });
  }
  return pyodideChargement;
}

function normaliser(s: string) {
  return s.trim().replace(/\s+/g, " ").replace(/'/g, '"');
}

// Série de bonnes réponses d'affilée (pour les succès du compte, pas de score/XP)
function enregistrerSucces() {
  const actuelle = Number(localStorage.getItem("nexora_serie_actuelle") ?? "0") + 1;
  localStorage.setItem("nexora_serie_actuelle", String(actuelle));
  const record = Number(localStorage.getItem("nexora_serie_record") ?? "0");
  if (actuelle > record) localStorage.setItem("nexora_serie_record", String(actuelle));
}

function enregistrerEchecQcm() {
  localStorage.setItem("nexora_serie_actuelle", "0");
}

// Liste "à revoir" : pas un score, juste un repère des exercices pas encore
// maîtrisés, pour réviser de façon ciblée. Se vide automatiquement quand
// l'exercice est enfin réussi.
interface EntreeARevoir {
  titre: string;
  href: string;
  echecs: number;
}

function chargerARevoir(): Record<string, EntreeARevoir> {
  try {
    return JSON.parse(localStorage.getItem("nexora_a_revoir") ?? "{}");
  } catch {
    return {};
  }
}

function enregistrerEchecExercice(cle: string, titre: string, href: string) {
  const liste = chargerARevoir();
  const existant = liste[cle];
  liste[cle] = { titre, href, echecs: (existant?.echecs ?? 0) + 1 };
  localStorage.setItem("nexora_a_revoir", JSON.stringify(liste));
}

function retirerARevoir(cle: string) {
  const liste = chargerARevoir();
  if (liste[cle]) {
    delete liste[cle];
    localStorage.setItem("nexora_a_revoir", JSON.stringify(liste));
  }
}

// Traduit le message brut d'une erreur Python (Pyodide) en explication
// comprehensible pour un debutant, sans jargon anglais.
function traduireErreurPython(brut: string): string {
  const correspondances: { motif: RegExp; message: (m: RegExpMatchArray) => string }[] = [
    {
      motif: /NameError: name '([^']+)' is not defined/,
      message: (m) => `Tu utilises "${m[1]}" mais cette variable n'existe pas (encore). Vérifie que tu l'as bien créée avant, avec exactement la même orthographe.`,
    },
    {
      motif: /IndentationError/,
      message: () => `Problème d'indentation : en Python, les espaces au début des lignes comptent. Vérifie que les lignes à l'intérieur d'un bloc (après un ":") sont décalées de la même façon.`,
    },
    {
      motif: /SyntaxError/,
      message: () => `Erreur de syntaxe : il manque probablement une parenthèse, un ":" ou des guillemets quelque part dans ton code.`,
    },
    {
      motif: /ZeroDivisionError/,
      message: () => `Tu essaies de diviser par zéro, ce qui est impossible.`,
    },
    {
      motif: /IndexError/,
      message: () => `Tu essaies d'accéder à un élément qui n'existe pas dans ta liste (l'indice demandé est trop grand, ou la liste est vide).`,
    },
    {
      motif: /KeyError: '([^']+)'/,
      message: (m) => `La clé "${m[1]}" n'existe pas dans ce dictionnaire. Vérifie son orthographe.`,
    },
    {
      motif: /AttributeError: '(\w+)' object has no attribute '(\w+)'/,
      message: (m) => `Un objet de type "${m[1]}" n'a pas de "${m[2]}". Vérifie le nom de la méthode ou de l'attribut que tu utilises.`,
    },
    {
      motif: /TypeError: unsupported operand type/,
      message: () => `Tu mélanges deux types incompatibles (par exemple un texte et un nombre) dans une opération. Vérifie le type de tes variables.`,
    },
    {
      motif: /TypeError: \w+\(\) missing \d+ required positional argument/,
      message: () => `Il manque un ou plusieurs arguments quand tu appelles cette fonction. Regarde combien de paramètres elle attend.`,
    },
    {
      motif: /TypeError/,
      message: () => `Il y a une incompatibilité de type : tu mélanges probablement un texte, un nombre ou une liste d'une façon qui n'est pas permise.`,
    },
    {
      motif: /ValueError/,
      message: () => `La valeur donnée n'est pas celle attendue ici (par exemple, convertir en nombre un texte qui n'en est pas un).`,
    },
    {
      motif: /ModuleNotFoundError|ImportError/,
      message: () => `Ce module n'est pas disponible ici. Utilise uniquement les outils proposés dans l'exercice.`,
    },
  ];

  for (const { motif, message } of correspondances) {
    const m = brut.match(motif);
    if (m) return message(m);
  }
  return "Il y a une erreur dans ton code. Le message technique ci-dessus indique en général le type de problème et parfois la ligne concernée.";
}

function blocCode(blocs: string[]) {
  return blocs
    .map((bloc) => {
      const lignes = bloc.split("\n");
      const langage = bloc.includes("<html>") || bloc.trim().startsWith("<") ? "html" : "python";
      return `
        <div class="terminal" style="margin-bottom: 1.25rem;">
          <div class="terminal-barre"><span>${langage}</span></div>
          <div class="terminal-corps">
            ${lignes
              .map(
                (l, i) =>
                  `<div class="terminal-ligne"><span class="num">${i + 1}</span><span>${l.replace(/</g, "&lt;")}</span></div>`
              )
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

export function initExercices(opts: OptionsMoteur) {
  const body = document.getElementById(opts.corpsId)!;
  const progress = document.getElementById(opts.progressionId)!;
  const niveauId = opts.cleProgres.replace("nexora_progres_", "");
  const hrefNiveau = opts.hrefRevoir ?? `${opts.base}lecons/${niveauId}/`;
  let current = 0;

  function progresActuel(): string[] {
    try {
      return JSON.parse(localStorage.getItem(opts.cleProgres) ?? "[]");
    } catch {
      return [];
    }
  }

  function marquerTermine(id: string) {
    retirerARevoir(`${opts.cleProgres}:${id}`);
    const fait = progresActuel();
    if (!fait.includes(id)) {
      fait.push(id);
      localStorage.setItem(opts.cleProgres, JSON.stringify(fait));
      enregistrerSucces();
    }
  }

  function renderProgress() {
    progress.innerHTML = "";
    for (let i = 0; i < opts.unites.length; i++) {
      const span = document.createElement("span");
      if (i < current) span.className = "fait";
      else if (i === current) span.className = "courant";
      progress.appendChild(span);
    }
  }

  function avancer() {
    current++;
    if (current >= opts.unites.length) {
      renderFin();
    } else {
      renderProgress();
      renderUnite(opts.unites[current]);
    }
  }

  function renderFin() {
    progress.innerHTML = "";
    body.innerHTML = `
      <div class="resultat">
        <span class="commentaire">bravo</span>
        <h2>${opts.titreFin}</h2>
        <p style="color: var(--ink-dim);">${opts.texteFin}</p>
        <div class="actions"><a class="btn" href="${opts.retourHref}">Retour aux niveaux</a></div>
      </div>
    `;
  }

  function renderUnite(u: Unite) {
    body.innerHTML = `
      <span class="commentaire">${current + 1} sur ${opts.unites.length} · ${u.titre}</span>
      <p class="explication" style="margin-top: 0.4rem;">${u.explication}</p>
      ${blocCode(u.exemple)}
      <p class="consigne">${u.consigne}</p>
      ${u.code ? blocCode(u.code) : ""}
      <div id="zone-exercice"></div>
      <div id="zone-suite"></div>
    `;

    const zone = document.getElementById("zone-exercice")!;
    const suite = document.getElementById("zone-suite")!;

    function proposerSuite(reussi: boolean) {
      if (reussi) marquerTermine(u.id);
      const explication = u.explicationReponse
        ? `<p class="retour-explication">${u.explicationReponse}</p>`
        : "";
      suite.innerHTML = `
        ${explication}
        <div class="actions" style="margin-top: 1.25rem;">
          <button class="btn" id="btn-suivant" type="button">${current === opts.unites.length - 1 ? "Terminer" : "Exercice suivant"}</button>
        </div>
      `;
      document.getElementById("btn-suivant")!.addEventListener("click", avancer);
    }

    if (u.type === "qcm") {
      zone.innerHTML = `
        <div class="options">
          ${u.options!.map((opt, i) => `<button class="option" data-index="${i}">${opt}</button>`).join("")}
        </div>
      `;
      const boutons = zone.querySelectorAll<HTMLButtonElement>(".option");
      boutons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const choisi = Number(btn.dataset.index);
          boutons.forEach((b) => (b.disabled = true));
          const correct = choisi === u.bonneOption;
          if (correct) {
            btn.classList.add("bonne");
          } else {
            btn.classList.add("mauvaise");
            boutons[u.bonneOption!].classList.add("bonne");
            enregistrerEchecQcm();
            enregistrerEchecExercice(`${opts.cleProgres}:${u.id}`, u.titre, hrefNiveau);
          }
          proposerSuite(correct);
        });
      });
    } else if (u.type === "completer" || u.type === "ecrire") {
      zone.innerHTML = `
        <input class="champ-reponse" id="champ" type="text" placeholder="${u.placeholder ?? ""}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
        <div class="actions" style="margin-top: 0.9rem;"><button class="btn-ghost" id="btn-verifier" type="button">Vérifier</button></div>
        <p class="retour" id="retour"></p>
      `;
      const champ = document.getElementById("champ") as HTMLInputElement;
      const retour = document.getElementById("retour")!;

      function verifier() {
        const val = normaliser(champ.value);
        const ok = u.reponsesValides!.test(val);
        if (ok) {
          retour.textContent = "C'est exact.";
          retour.className = "retour ok";
          champ.disabled = true;
          document.getElementById("btn-verifier")!.setAttribute("disabled", "true");
          proposerSuite(true);
        } else {
          retour.textContent = u.indiceErreur ?? "Essaie encore.";
          retour.className = "retour ko";
          enregistrerEchecExercice(`${opts.cleProgres}:${u.id}`, u.titre, hrefNiveau);
        }
      }

      document.getElementById("btn-verifier")!.addEventListener("click", verifier);
      champ.addEventListener("keydown", (e) => {
        if (e.key === "Enter") verifier();
      });
    } else if (u.type === "code") {
      zone.innerHTML = `
        <div class="terminal terminal-editable">
          <div class="terminal-barre">
            <span>python — modifiable</span>
            <span class="pyodide-statut" id="statut-pyodide">chargement de Python…</span>
          </div>
          <div class="terminal-corps">
            <textarea id="zone-code" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off">${u.codeDepart ?? ""}</textarea>
          </div>
          <div class="terminal-run-barre">
            <button class="btn-run" id="btn-run" type="button" disabled>▶ Exécuter</button>
          </div>
          <div class="terminal-sortie vide" id="sortie"></div>
        </div>
      `;

      const textarea = document.getElementById("zone-code") as HTMLTextAreaElement;
      const btnRun = document.getElementById("btn-run") as HTMLButtonElement;
      const sortie = document.getElementById("sortie")!;
      const statut = document.getElementById("statut-pyodide")!;

      chargerPyodide()
        .then(() => {
          statut.textContent = "prêt";
          btnRun.disabled = false;
        })
        .catch(() => {
          statut.textContent = "indisponible";
          sortie.textContent = "Impossible de charger Python dans le navigateur pour l'instant. Réessaie dans un instant, ou vérifie ta connexion.";
          sortie.className = "terminal-sortie erreur";
        });

      btnRun.addEventListener("click", async () => {
        if (!pyodideInstance) return;
        btnRun.disabled = true;
        btnRun.textContent = "Exécution…";
        sortie.className = "terminal-sortie";
        sortie.textContent = "";

        try {
          pyodideInstance.setStdout({
            batched: (s: string) => {
              sortie.textContent += (sortie.textContent ? "\n" : "") + s;
            },
          });
          await pyodideInstance.runPythonAsync(textarea.value);
          const texteSortie = sortie.textContent.trim();
          sortie.classList.toggle("vide", texteSortie.length === 0);

          const correct = u.sortieAttendue ? u.sortieAttendue.test(texteSortie) : true;
          if (correct) {
            sortie.classList.add("ok");
            const explicationCode = u.explicationReponse
              ? `<p class="retour-explication">${u.explicationReponse}</p>`
              : "";
            suite.innerHTML = `
              <p class="retour ok" style="margin-top: 1rem;">Exactement le résultat attendu.</p>
              ${explicationCode}
              <div class="actions" style="margin-top: 0.5rem;">
                <button class="btn" id="btn-suivant" type="button">${current === opts.unites.length - 1 ? "Terminer" : "Exercice suivant"}</button>
              </div>
            `;
            marquerTermine(u.id);
            document.getElementById("btn-suivant")!.addEventListener("click", avancer);
          } else {
            suite.innerHTML = `<p class="retour ko" style="margin-top: 1rem;">${u.indiceCode ?? "Ce n'est pas encore le résultat attendu."}</p>`;
            enregistrerEchecExercice(`${opts.cleProgres}:${u.id}`, u.titre, hrefNiveau);
          }
        } catch (err: any) {
          const brut = String(err?.message ?? err).split("\n").pop() ?? "Erreur";
          sortie.className = "terminal-sortie erreur";
          sortie.textContent = brut;
          suite.innerHTML = `<p class="retour ko" style="margin-top: 1rem;">${traduireErreurPython(brut)}</p>`;
          enregistrerEchecExercice(`${opts.cleProgres}:${u.id}`, u.titre, hrefNiveau);
        } finally {
          btnRun.disabled = false;
          btnRun.textContent = "▶ Exécuter";
        }
      });
    } else if (u.type === "html") {
      zone.innerHTML = `
        <div class="terminal terminal-editable">
          <div class="terminal-barre"><span>html — modifiable</span></div>
          <div class="terminal-corps">
            <textarea id="zone-html" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off">${(u.codeDepart ?? "").replace(/</g, "&lt;")}</textarea>
          </div>
        </div>
        <p class="apercu-legende">Aperçu en direct</p>
        <iframe id="apercu" class="apercu-iframe" title="Aperçu de ta page" sandbox=""></iframe>
        <div class="actions" style="margin-top: 0.9rem;"><button class="btn-ghost" id="btn-verifier-html" type="button">Vérifier</button></div>
        <p class="retour" id="retour-html"></p>
      `;

      const textarea = document.getElementById("zone-html") as HTMLTextAreaElement;
      const iframe = document.getElementById("apercu") as HTMLIFrameElement;
      const retour = document.getElementById("retour-html")!;

      function rafraichirApercu() {
        iframe.srcdoc = textarea.value;
      }
      rafraichirApercu();
      textarea.addEventListener("input", rafraichirApercu);

      document.getElementById("btn-verifier-html")!.addEventListener("click", () => {
        const ok = u.regexHtml ? u.regexHtml.test(textarea.value) : true;
        if (ok) {
          retour.textContent = "C'est exact.";
          retour.className = "retour ok";
          proposerSuite(true);
        } else {
          retour.textContent = u.indiceHtml ?? "Ce n'est pas encore ça.";
          retour.className = "retour ko";
          enregistrerEchecExercice(`${opts.cleProgres}:${u.id}`, u.titre, hrefNiveau);
        }
      });
    }
  }

  const fait = progresActuel();
  const premierNonFait = opts.unites.findIndex((u) => !fait.includes(u.id));
  current = premierNonFait === -1 ? opts.unites.length : premierNonFait;

  if (current >= opts.unites.length) {
    renderFin();
  } else {
    renderProgress();
    renderUnite(opts.unites[current]);
  }
}
