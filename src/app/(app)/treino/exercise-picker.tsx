"use client";

import { useState } from "react";

export type ExerciseOption = { id: string; name: string };

/** Select de exercício com opção de cadastrar um novo na hora. */
export function ExercisePicker({
  exercises,
  value,
  onChange,
}: {
  exercises: ExerciseOption[];
  value?: string;
  onChange?: (id: string) => void;
}) {
  const [internal, setInternal] = useState(value ?? (exercises[0]?.id ?? "__new__"));
  const selected = value ?? internal;

  return (
    <div className="space-y-2">
      <select
        name="exercise_id"
        className="input"
        value={selected}
        onChange={(e) => {
          setInternal(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
        <option value="__new__">+ Novo exercício</option>
      </select>
      {selected === "__new__" && (
        <div className="grid grid-cols-2 gap-2">
          <input name="new_exercise" className="input" placeholder="Nome (ex.: Supino reto)" required />
          <input name="muscle_group" className="input" placeholder="Grupo (ex.: Peito)" />
        </div>
      )}
    </div>
  );
}
