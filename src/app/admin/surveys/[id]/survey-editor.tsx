"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveSurveyAction } from "@/app/actions/surveys";
import { Button } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/primitives";
import type { ActionState } from "@/lib/action-state";
import type { QuestionInput, SurveyInput } from "@/lib/survey-schema";
import { METRIC_LABELS, METRICS_BY_TYPE, QUESTION_TYPE_LABELS } from "@/lib/survey-template";

type EditableQuestion = QuestionInput & { key: string };

function stripKey(q: EditableQuestion): QuestionInput {
  const copy: Partial<EditableQuestion> = { ...q };
  delete copy.key;
  return copy as QuestionInput;
}

export function SurveyEditor({ surveyId, initial }: { surveyId: string; initial: SurveyInput }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [welcomeText, setWelcomeText] = useState(initial.welcomeText);
  const [closingText, setClosingText] = useState(initial.closingText);
  // Claves deterministas (iguales en servidor y cliente) para no romper la hidratación.
  const [questions, setQuestions] = useState<EditableQuestion[]>(() => initial.questions.map((q, i) => ({ ...q, key: `q${i}` })));
  const nextKey = useRef(initial.questions.length);
  const newKey = () => `q${nextKey.current++}`;
  const [result, setResult] = useState<(ActionState & { snapshot: string }) | null>(null);
  const [pending, start] = useTransition();
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial));

  const payload: SurveyInput = useMemo(
    () => ({
      title,
      welcomeText,
      closingText,
      questions: questions.map(stripKey),
    }),
    [title, welcomeText, closingText, questions],
  );
  const dirty = JSON.stringify(payload) !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const usedMetrics = new Set(questions.map((q) => q.metric).filter((m) => m !== "NONE"));

  const update = (key: string, patch: Partial<QuestionInput>) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  const move = (from: number, to: number) => setQuestions((qs) => arrayMove(qs, from, to));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = questions.findIndex((q) => q.key === e.active.id);
    const to = questions.findIndex((q) => q.key === e.over!.id);
    move(from, to);
  };

  const save = () =>
    start(async () => {
      const r = await saveSurveyAction(surveyId, payload);
      setResult({ ...r, snapshot: JSON.stringify(payload) });
      if (r.ok) {
        setSavedSnapshot(JSON.stringify(payload));
        router.refresh();
      }
    });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <DndContext id="survey-editor" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={questions.map((q) => q.key)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3">
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.key}
                  q={q}
                  index={i}
                  total={questions.length}
                  usedMetrics={usedMetrics}
                  onChange={(patch) => update(q.key, patch)}
                  onMove={(dir) => move(i, i + dir)}
                  onRemove={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <Button
          variant="secondary"
          onClick={() =>
            setQuestions((qs) => [...qs, { key: newKey(), type: "RATING_5", text: "", required: true, metric: "NONE" }])
          }
          disabled={questions.length >= 30}
        >
          <Plus size={16} /> Agregar pregunta
        </Button>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-6 lg:h-fit">
        <div className="panel space-y-5 p-5">
          <Field label="Título interno" htmlFor="title">
            <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Texto de bienvenida" htmlFor="welcome" hint="Aparece antes de la primera pregunta.">
            <textarea
              id="welcome"
              className="input"
              rows={3}
              value={welcomeText}
              onChange={(e) => setWelcomeText(e.target.value)}
              maxLength={300}
            />
          </Field>
          <Field label="Mensaje final" htmlFor="closing" hint="Aparece al terminar.">
            <input
              id="closing"
              className="input"
              value={closingText}
              onChange={(e) => setClosingText(e.target.value)}
              maxLength={200}
            />
          </Field>
        </div>
        <div className="space-y-3">
          {/* El error solo se muestra mientras el contenido sigue igual al que se intentó guardar. */}
          {result?.error && result.snapshot === JSON.stringify(payload) ? <Notice tone="red">{result.error}</Notice> : null}
          {result?.ok && !dirty ? <Notice tone="green">{result.message}</Notice> : null}
          <Button className="w-full" size="lg" onClick={save} disabled={pending || !dirty}>
            {pending ? "Guardando…" : dirty ? "Guardar cambios" : "Sin cambios"}
          </Button>
          {dirty ? <p className="text-center text-[13px] text-ink-soft">Tienes cambios sin guardar.</p> : null}
        </div>
      </aside>
    </div>
  );
}

function QuestionCard({
  q,
  index,
  total,
  usedMetrics,
  onChange,
  onMove,
  onRemove,
}: {
  q: EditableQuestion;
  index: number;
  total: number;
  usedMetrics: Set<string>;
  onChange: (patch: Partial<QuestionInput>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.key });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const id = q.key;
  const metrics = METRICS_BY_TYPE[q.type];

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`panel flex gap-3 p-4 ${isDragging ? "relative z-10 shadow-lg ring-2 ring-basil/30" : ""}`}
    >
      <div className="flex flex-col items-center gap-1 pt-1">
        <button
          type="button"
          className="cursor-grab rounded p-1 text-ink-faint hover:bg-line-soft hover:text-ink active:cursor-grabbing"
          aria-label={`Arrastrar pregunta ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} />
        </button>
        <span className="font-display text-lg font-semibold text-ink-faint tabular-nums">{index + 1}</span>
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <label htmlFor={`${id}-text`} className="sr-only">
            Texto de la pregunta {index + 1}
          </label>
          <input
            id={`${id}-text`}
            className="input text-base font-medium"
            placeholder="Escribe la pregunta"
            value={q.text}
            onChange={(e) => onChange({ text: e.target.value })}
            maxLength={200}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-type`} className="mb-1 block text-[13px] text-ink-soft">
              Tipo de respuesta
            </label>
            <select
              id={`${id}-type`}
              className="input"
              value={q.type}
              onChange={(e) => {
                const type = e.target.value as QuestionInput["type"];
                onChange({
                  type,
                  metric: METRICS_BY_TYPE[type].includes(q.metric) ? q.metric : "NONE",
                  choices: type === "SINGLE_CHOICE" ? (q.choices?.length ? q.choices : ["", ""]) : undefined,
                  required: type === "TEXT" ? false : q.required,
                });
              }}
            >
              {Object.entries(QUESTION_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-metric`} className="mb-1 block text-[13px] text-ink-soft">
              Indicador en el resumen
            </label>
            <select
              id={`${id}-metric`}
              className="input"
              value={q.metric}
              disabled={metrics.length === 1}
              onChange={(e) => onChange({ metric: e.target.value as QuestionInput["metric"] })}
            >
              {metrics.map((m) => (
                <option key={m} value={m} disabled={m !== "NONE" && m !== q.metric && usedMetrics.has(m)}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {q.type === "SINGLE_CHOICE" ? (
          <div className="space-y-2">
            <p className="text-[13px] text-ink-soft">Opciones</p>
            {(q.choices ?? []).map((c, ci) => (
              <div key={ci} className="flex gap-2">
                <input
                  className="input"
                  value={c}
                  aria-label={`Opción ${ci + 1}`}
                  onChange={(e) => {
                    const choices = [...(q.choices ?? [])];
                    choices[ci] = e.target.value;
                    onChange({ choices });
                  }}
                  maxLength={80}
                />
                <Button
                  variant="ghost"
                  size="md"
                  aria-label={`Quitar opción ${ci + 1}`}
                  onClick={() => onChange({ choices: (q.choices ?? []).filter((_, j) => j !== ci) })}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ choices: [...(q.choices ?? []), ""] })}
              disabled={(q.choices?.length ?? 0) >= 10}
            >
              <Plus size={14} /> Agregar opción
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={q.required} onChange={(e) => onChange({ required: e.target.checked })} />
            Obligatoria
          </label>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Subir">
              <ArrowUp size={15} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Bajar">
              <ArrowDown size={15} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!q.text || confirm("¿Quitar esta pregunta?")) onRemove();
              }}
              disabled={total === 1}
              className="text-chile hover:bg-chile-tint hover:text-chile"
            >
              <Trash2 size={15} /> Quitar
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
