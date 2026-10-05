"use client";

export function BackButton() {
  return (
    <button type="button" onClick={() => history.back()} className="link">
      Volver a la encuesta
    </button>
  );
}
