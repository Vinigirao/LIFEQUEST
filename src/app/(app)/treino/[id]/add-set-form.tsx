"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { addSet } from "../actions";
import { ExercisePicker, type ExerciseOption } from "../exercise-picker";

type Last = Record<string, { weight: number; reps: number }>;

function Stepper({
  name,
  label,
  value,
  step,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  step: number;
  onChange: (v: string) => void;
}) {
  const bump = (d: number) => {
    const n = Number(value.replace(",", ".")) || 0;
    onChange(String(Math.max(0, Math.round((n + d) * 100) / 100)));
  };
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-sm px-2" onClick={() => bump(-step)} aria-label={`Diminuir ${label}`}>
          <Minus size={16} />
        </button>
        <input
          name={name}
          inputMode="decimal"
          className="input text-center font-semibold"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button type="button" className="btn btn-sm px-2" onClick={() => bump(step)} aria-label={`Aumentar ${label}`}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

export function AddSetForm({
  sessionId,
  exercises,
  defaultExerciseId,
  last,
}: {
  sessionId: string;
  exercises: ExerciseOption[];
  defaultExerciseId?: string;
  last: Last;
}) {
  const initial = defaultExerciseId ?? exercises[0]?.id ?? "__new__";
  const [exerciseId, setExerciseId] = useState(initial);
  const [weight, setWeight] = useState(String(last[initial]?.weight ?? ""));
  const [reps, setReps] = useState(String(last[initial]?.reps ?? ""));

  function pick(id: string) {
    setExerciseId(id);
    if (last[id]) {
      setWeight(String(last[id].weight));
      setReps(String(last[id].reps));
    }
  }

  return (
    <form
      action={async (fd) => {
        await addSet(fd);
        // Depois de salvar um exercício novo, a lista recarrega com ele; volta para o primeiro
        if (exerciseId === "__new__") setExerciseId(exercises[0]?.id ?? "__new__");
      }}
      className="card space-y-3"
    >
      <input type="hidden" name="session_id" value={sessionId} />
      <p className="font-semibold">Adicionar série</p>
      <ExercisePicker exercises={exercises} value={exerciseId} onChange={pick} />
      <div className="grid grid-cols-2 gap-3">
        <Stepper name="weight" label="Carga (kg)" value={weight} step={2.5} onChange={setWeight} />
        <Stepper name="reps" label="Repetições" value={reps} step={1} onChange={setReps} />
      </div>
      <SubmitButton className="btn btn-primary w-full">Salvar série</SubmitButton>
    </form>
  );
}
