import { useEffect, useMemo, useState } from "react";
import type { ScriptDoc, ScriptChapter } from "../types";

const STORAGE_KEY = "smui.scripts.v1";

const seedDocs: ScriptDoc[] = [
  {
    id: "doc-1",
    name: "Prompter XL Overview",
    chapters: [
      { id: "c1", text: "So let’s break down the design of Prompter XL first, and then we’ll talk about who Prompter XL is for." },
      { id: "c2", text: `Hola.
Esta es una prueba completa de teleprompter con seguimiento por voz.

Ahora voy a empezar leyendo a velocidad normal.
Si todo funciona correctamente, el texto debería avanzar palabra por palabra, siguiendo exactamente lo que digo.

Voy a hacer una pausa breve…

Y continúo.

El objetivo de esta prueba es comprobar que el sistema reconoce correctamente palabras largas, palabras cortas y también palabras que suenan parecido, como casa y caza, o tubo y tuvo.

Ahora voy a cambiar ligeramente el ritmo.
Hablaré un poco más rápido para ver si el seguimiento mantiene la precisión sin adelantarse demasiado ni quedarse atrás.

Uno, dos, tres, cuatro, cinco.
Diez, veinte, treinta, cuarenta y cincuenta.

También voy a incluir algunas frases más largas que obliguen al sistema a mantener el contexto sin perder la posición dentro del párrafo, especialmente cuando las oraciones contienen comas, pequeñas pausas o cambios de entonación que pueden confundir a un motor de reconocimiento de voz.

Ahora hablaré más despacio.
Muy despacio.
Separando cada palabra con claridad.

Este sistema debería detectar cada término sin necesidad de exagerar la pronunciación.

Voy a repetir una palabra varias veces:
seguimiento, seguimiento, seguimiento.

Y ahora una frase con posibles errores:

A veces el reconocimiento puede confundir palabras como grabar y gravar, o votar y botar.

Si el texto sigue avanzando correctamente, significa que el algoritmo está alineando bien el audio con el contenido visible.

Ahora voy a hacer una pausa más larga…

…

Y continúo.

Este es un buen momento para comprobar si el teleprompter mantiene la posición o si intenta reajustar cuando detecta silencio.

Finalmente, voy a cerrar esta prueba con una frase clara y directa:

El seguimiento por voz debe sentirse natural, fluido y prácticamente invisible para el usuario.

Fin de la prueba.` },
      { id: "c3", text: "First thing is, when you unbox your Prompter XL, you’ll notice that the beam splitter glass is separate from the Prompter body..." },
      { id: "c4", text: "So it’s nearly twice the physical size of Prompter, and is over 3 times the resolution..." },
    ],
  }
];

function createId(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

export function useScripts(opts?: { persist?: boolean }) {
  const persist = opts?.persist ?? true;

  const [docs, setDocs] = useState<ScriptDoc[]>(() => {
    // keep the existing localStorage seed for immediate UI responsiveness;
    // we'll migrate/load IndexedDB in an effect shortly after mount.
    if (persist) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as ScriptDoc[];
      } catch (err) {
        // fall back to seed
      }
    }
    return seedDocs;
  });

  const [activeDocId, setActiveDocId] = useState<string>(() => docs[0]?.id ?? "");

  // persist to localStorage (small/fast) and asynchronously mirror to IndexedDB
  useEffect(() => {
    if (!persist) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
    } catch (err) {
      // ignore
    }

    // async mirror to IndexedDB
    (async () => {
      try {
        const { idbSet } = await import("../lib/db");
        await idbSet(STORAGE_KEY, docs);
      } catch (err) {
        /* ignore IDB failures */
      }
    })();
  }, [docs, persist]);

  // on mount: try to load from IndexedDB (migrate from localStorage if present)
  useEffect(() => {
    if (!persist) return;
    let mounted = true;
    (async () => {
      try {
        const { idbGet, idbSet } = await import("../lib/db");
        const saved = await idbGet<ScriptDoc[]>(STORAGE_KEY);
        if (mounted && saved && Array.isArray(saved) && saved.length > 0) {
          setDocs(saved);
          setActiveDocId(saved[0]?.id ?? "");
        } else {
          // if nothing in IDB but there is localStorage, migrate it
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as ScriptDoc[];
            await idbSet(STORAGE_KEY, parsed);
          }
        }
      } catch (err) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [persist]);

  const activeDoc = useMemo(() => docs.find((d) => d.id === activeDocId) ?? docs[0] ?? null, [docs, activeDocId]);

  function addScript(name = "Untitled script") {
    const id = createId("doc");
    const doc: ScriptDoc = { id, name, chapters: [{ id: createId("c"), text: "" }] };
    setDocs((s) => [doc, ...s]);
    setActiveDocId(id);
    return id;
  }

  function removeScript(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setActiveDocId((prev) => {
      const remain = docs.filter((d) => d.id !== prev);
      return remain[0]?.id ?? "";
    });
  }

  function updateChapter(docId: string, chapterId: string, text: string) {
    setDocs((prev) =>
      prev.map((d) =>
        d.id !== docId
          ? d
          : { ...d, chapters: d.chapters.map((c) => (c.id === chapterId ? { ...c, text } : c)) }
      )
    );
  }

  function addChapter(docId: string, opts?: { afterId?: string; text?: string }) {
    const chapter: ScriptChapter = { id: createId("c"), text: opts?.text ?? "" };
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        if (!opts?.afterId) return { ...d, chapters: [...d.chapters, chapter] };
        const idx = d.chapters.findIndex((c) => c.id === opts.afterId);
        if (idx === -1) return { ...d, chapters: [...d.chapters, chapter] };
        const next = [...d.chapters];
        next.splice(idx + 1, 0, chapter);
        return { ...d, chapters: next };
      })
    );
    return chapter.id;
  }

  function addChapterBefore(docId: string, beforeId: string) {
    const chapter: ScriptChapter = { id: createId("c"), text: "" };
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        const idx = d.chapters.findIndex((c) => c.id === beforeId);
        const next = [...d.chapters];
        next.splice(Math.max(0, idx), 0, chapter);
        return { ...d, chapters: next };
      })
    );
    return chapter.id;
  }

  function removeChapter(docId: string, chapterId: string) {
    setDocs((prev) => prev.map((d) => (d.id !== docId ? d : { ...d, chapters: d.chapters.filter((c) => c.id !== chapterId) })));
  }

  /** Move a chapter (by id) to a new index within the same document. */
  function moveChapter(docId: string, chapterId: string, toIndex: number) {
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        const idx = d.chapters.findIndex((c) => c.id === chapterId);
        if (idx === -1) return d;
        const next = d.chapters.slice();
        const [item] = next.splice(idx, 1);
        const clamped = Math.max(0, Math.min(toIndex, next.length));
        next.splice(clamped, 0, item);
        return { ...d, chapters: next };
      })
    );
  }

  function renameScript(docId: string, name: string) {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, name } : d)));
  }

  async function exportScripts(): Promise<string> {
    return JSON.stringify(docs, null, 2);
  }

  async function importScripts(json: string) {
    try {
      const parsed = JSON.parse(json) as ScriptDoc[];
      if (!Array.isArray(parsed)) throw new Error("Invalid format");
      setDocs(parsed);
      setActiveDocId(parsed[0]?.id ?? "");
      // persist to both storage layers
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        const { idbSet } = await import("../lib/db");
        await idbSet(STORAGE_KEY, parsed);
      } catch (err) {
        /* ignore */
      }
    } catch (err) {
      throw err;
    }
  }

  function resetSeed() {
    setDocs(seedDocs);
    setActiveDocId(seedDocs[0].id);
  }

  return {
    docs,
    activeDoc,
    activeDocId,
    setActiveDocId,
    addScript,
    removeScript,
    renameScript,
    updateChapter,
    addChapter,
    addChapterBefore,
    removeChapter,
    moveChapter,
    resetSeed,
    exportScripts,
    importScripts,
  } as const;
}
