"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SurveyRunner } from "@/components/survey/survey-runner";
import { readableOn, type RunnerSurvey, type SubmitPayload } from "@/components/survey/types";
import { Keypad } from "./keypad";
import { backgroundRefreshMs, isNightPause } from "./schedule";
import { hashPin, type KioskConfig, kioskStore } from "./storage";

// "table" es la pantalla de espera (la usa el mesero); "welcome" y "survey" son del comensal.
type Phase = "boot" | "pair" | "table" | "welcome" | "survey";

const CONFIG_REFRESH_MS = 60_000;
const FLUSH_INTERVAL_MS = 30_000;
const SECRET_HOLD_MS = 3000;
const TABLE_MAX_DIGITS = 4;
// Al desvincular: cuánto se espera a que salgan las respuestas en cola y a que el servidor conteste.
const UNPAIR_FLUSH_MS = 8000;
const UNPAIR_REQUEST_MS = 5000;

const UNPAIRED_NOTICE = "Esta tablet fue desvinculada desde el panel. Escribe un código nuevo.";
const RESTAURANT_GONE_NOTICE = "El restaurante de esta tablet ya no existe. Escribe un código nuevo.";

/**
 * Lo que la app Android (android-tablet/) usa de esta página desde su "Menú de la app".
 * `busy` es true mientras `check` espera al servidor.
 */
type KioskBridge = { busy: boolean; check: () => void; requestUnpair: () => void };

export function KioskApp() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [cycleSurvey, setCycleSurvey] = useState<RunnerSurvey | null>(null);
  // Mesa del comensal en turno; la escribe el mesero y se borra al volver a la pantalla de espera.
  const [table, setTable] = useState<string | null>(null);
  const [waitKey, setWaitKey] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  // "unpair" abre el menú directo en "Desvincular esta tablet" (lo pide la app Android, que ya validó el PIN).
  const [menu, setMenu] = useState<"closed" | "pin" | "open" | "unpair">("closed");
  const [notice, setNotice] = useState<string | null>(null);

  const lastFetch = useRef(0);
  const flushing = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const unpair = useCallback((message?: string) => {
    kioskStore.clearAll();
    setConfig(null);
    setPending(0);
    setPhase("pair");
    setMenu("closed");
    if (message) setNotice(message);
  }, []);

  const refreshConfig = useCallback(async (): Promise<KioskConfig | undefined> => {
    const token = kioskStore.getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/kiosk/config", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.status === 401) {
        unpair(UNPAIRED_NOTICE);
        return;
      }
      // El restaurante se borró: sin esto la tablet se quedaría con una encuesta y un PIN que ya no existen.
      if (res.status === 404) {
        unpair(RESTAURANT_GONE_NOTICE);
        return;
      }
      if (!res.ok) return;
      const c = (await res.json()) as KioskConfig;
      kioskStore.setConfig(c);
      setConfig(c);
      lastFetch.current = Date.now();
      setOnline(true);
      return c;
    } catch {
      setOnline(false);
    }
  }, [unpair]);

  const flushQueue = useCallback(async () => {
    if (flushing.current) return;
    const token = kioskStore.getToken();
    if (!token) return;
    flushing.current = true;
    try {
      let queue = kioskStore.getQueue();
      while (queue.length) {
        const item = queue[0];
        let res: Response;
        try {
          res = await fetch("/api/responses", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(item.payload),
          });
        } catch {
          setOnline(false);
          break;
        }
        setOnline(true);
        if (res.status === 401) {
          unpair(UNPAIRED_NOTICE);
          return;
        }
        if (res.status === 429 || res.status >= 500) {
          item.attempts += 1;
          kioskStore.setQueue(queue);
          break;
        }
        // 2xx (guardada o duplicada) o 4xx definitivo (encuesta archivada, datos inválidos): se quita de la cola.
        queue = queue.slice(1);
        kioskStore.setQueue(queue);
      }
      setPending(kioskStore.getQueue().length);
    } finally {
      flushing.current = false;
    }
  }, [unpair]);

  // Arranque: token y configuración guardados → listo aunque no haya internet.
  useEffect(() => {
    const token = kioskStore.getToken();
    const cached = kioskStore.getConfig();
    /* eslint-disable react-hooks/set-state-in-effect */
    setPending(kioskStore.getQueue().length);
    setOnline(navigator.onLine);
    if (!token) {
      setPhase("pair");
      return;
    }
    if (cached) setConfig(cached);
    setPhase("table");
    /* eslint-enable react-hooks/set-state-in-effect */
    void refreshConfig();
    void flushQueue();
  }, [refreshConfig, flushQueue]);

  // Service worker para abrir sin internet.
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);

  // Sincronización periódica y al recuperar la conexión.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushQueue();
      void refreshConfig();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // La cola solo llama al servidor si hay respuestas pendientes.
    const flushT = setInterval(() => void flushQueue(), FLUSH_INTERVAL_MS);
    const cfgT = setInterval(() => {
      if (phaseRef.current === "table" && !isNightPause()) void refreshConfig();
    }, backgroundRefreshMs());
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(flushT);
      clearInterval(cfgT);
    };
  }, [flushQueue, refreshConfig]);

  // Mantener la pantalla encendida.
  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock && !wakeLock.current) {
        wakeLock.current = await nav.wakeLock.request("screen");
      }
    } catch {
      /* no soportado o sin gesto de usuario */
    }
  }, []);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        wakeLock.current = null;
        void requestWakeLock();
        void refreshConfig();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [requestWakeLock, refreshConfig]);

  const clearTimers = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (resetTimer.current) clearTimeout(resetTimer.current);
  };

  const backToTable = useCallback(() => {
    clearTimers();
    setPhase("table");
    setCycleSurvey(null);
    setTable(null);
    // Monta de nuevo el teclado de la mesa: el campo siempre vuelve vacío.
    setWaitKey((k) => k + 1);
    if (Date.now() - lastFetch.current > CONFIG_REFRESH_MS) void refreshConfig();
  }, [refreshConfig]);

  const bumpIdle = useCallback(() => {
    if (!config) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(backToTable, config.restaurant.idleSeconds * 1000);
  }, [config, backToTable]);

  const [starting, setStarting] = useState(false);

  // El mesero escribió la mesa (o la omitió): se prepara la bienvenida para el comensal.
  const startCycle = async (tableRef: string | null) => {
    if (!config?.survey || starting) return;
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    void requestWakeLock();
    // Antes de cada comensal, confirma cuál es la encuesta vigente (por si se publicó otra
    // mientras la tablet esperaba). Sin internet o si tarda, usa la guardada.
    setStarting(true);
    const fresh = navigator.onLine
      ? await Promise.race([refreshConfig(), new Promise<undefined>((r) => setTimeout(() => r(undefined), 2500))])
      : undefined;
    setStarting(false);
    const current = fresh ?? config;
    if (!current.survey || !current.restaurant.active) {
      backToTable();
      return;
    }
    setTable(tableRef);
    setCycleSurvey(current.survey);
    setPhase("welcome");
    bumpIdle();
  };

  // El comensal tocó la bienvenida.
  const startSurvey = () => {
    setRunKey((k) => k + 1);
    setPhase("survey");
    bumpIdle();
  };

  const onSubmit = useCallback(
    async (payload: SubmitPayload) => {
      // Siempre se guarda primero en la tablet: el comensal nunca ve un error por falta de internet.
      const queue = kioskStore.getQueue();
      queue.push({ payload: table ? { ...payload, tableRef: table } : payload, enqueuedAt: Date.now(), attempts: 0 });
      kioskStore.setQueue(queue);
      setPending(queue.length);
      void flushQueue();
    },
    [flushQueue, table],
  );

  const onDone = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    const secs = config?.restaurant.resetSeconds ?? 8;
    resetTimer.current = setTimeout(backToTable, secs * 1000);
  }, [config, backToTable]);

  useEffect(() => clearTimers, []);

  /** Intenta enviar lo que haya en cola y devuelve cuántas respuestas se perderían al desvincular. */
  const prepareUnpair = useCallback(async () => {
    await Promise.race([flushQueue(), new Promise((r) => setTimeout(r, UNPAIR_FLUSH_MS))]);
    const left = kioskStore.getQueue().length;
    setPending(left);
    return left;
  }, [flushQueue]);

  /** Libera la tablet en el servidor (si responde) y vuelve a la pantalla de vinculación. */
  const unpairHere = useCallback(async () => {
    const token = kioskStore.getToken();
    if (token) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), UNPAIR_REQUEST_MS);
      try {
        await fetch("/api/kiosk/unpair", { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
      } catch {
        // Sin conexión: la tablet se desvincula igual; en el panel seguirá como vinculada hasta que la quiten ahí.
      } finally {
        clearTimeout(timer);
      }
    }
    unpair();
  }, [unpair]);

  // Abrir el menú también comprueba la vinculación: si la quitaron desde el panel, la tablet
  // pasa a la pantalla de código en lugar de pedir un PIN que ya no sirve.
  const openMenu = useCallback(() => {
    setMenu("pin");
    void refreshConfig();
  }, [refreshConfig]);

  useEffect(() => {
    const bridge: KioskBridge = {
      busy: false,
      check: () => {
        bridge.busy = true;
        void refreshConfig().finally(() => {
          bridge.busy = false;
        });
      },
      requestUnpair: () => {
        if (kioskStore.getToken()) setMenu("unpair");
      },
    };
    const w = window as unknown as { sobremesaKiosk?: KioskBridge };
    w.sobremesaKiosk = bridge;
    return () => {
      if (w.sobremesaKiosk === bridge) delete w.sobremesaKiosk;
    };
  }, [refreshConfig]);

  // ───────── Render ─────────

  if (phase === "boot") return <div className="h-dvh bg-paper" />;

  if (phase === "pair") {
    return (
      <PairScreen
        notice={notice}
        onPaired={async (token) => {
          kioskStore.setToken(token);
          setNotice(null);
          await refreshConfig();
          setPhase("table");
        }}
      />
    );
  }

  const brand = config?.restaurant;
  const brandBg = brand?.primaryColor ?? "#2f6b4f";
  const brandInk = readableOn(brandBg);

  return (
    <div className="relative h-dvh overflow-hidden">
      <SecretCorner onTrigger={openMenu} />

      {phase === "survey" && cycleSurvey && brand ? (
        <div className="h-full overflow-y-auto">
          <SurveyRunner
            key={runKey}
            survey={cycleSurvey}
            restaurant={{ name: brand.name, logoUrl: brand.logoUrl, primaryColor: brand.primaryColor }}
            showWelcome={false}
            onSubmit={onSubmit}
            onDone={onDone}
            onActivity={bumpIdle}
            className="min-h-full"
            doneNote={
              <button
                type="button"
                onClick={backToTable}
                className="rounded-full px-4 py-2 text-base text-ink-soft underline-offset-2 hover:underline"
              >
                Terminar
              </button>
            }
          />
        </div>
      ) : phase === "welcome" && cycleSurvey && brand ? (
        <AttractScreen
          config={config ? { ...config, survey: cycleSurvey } : null}
          brandBg={brandBg}
          brandInk={brandInk}
          onStart={startSurvey}
        />
      ) : config?.survey && config.restaurant.active ? (
        <TableScreen
          key={waitKey}
          busy={starting}
          paused={menu !== "closed"}
          onActivity={bumpIdle}
          onStart={(t) => void startCycle(t)}
        />
      ) : (
        // Sin encuesta que mostrar (sin conexión, en pausa o sin publicar): solo el aviso.
        <AttractScreen config={config} brandBg={brandBg} brandInk={brandInk} onStart={() => undefined} />
      )}

      {table && (phase === "welcome" || phase === "survey") ? (
        <div
          className="pointer-events-none absolute top-3 right-3 z-30 rounded-full border border-current/25 px-3 py-1 text-[13px] opacity-75"
          style={{ color: phase === "welcome" ? brandInk : "var(--color-ink)" }}
        >
          Mesa {table}
        </div>
      ) : null}

      <StatusDot online={online} pending={pending} />

      {menu !== "closed" ? (
        <StaffMenu
          key={menu === "unpair" ? "unpair" : "menu"}
          // Sin configuración descargada no hay PIN que pedir: el menú abre directo para poder desvincular.
          stage={menu === "pin" && !config ? "open" : menu}
          config={config}
          pending={pending}
          onClose={() => setMenu("closed")}
          onUnlocked={() => setMenu("open")}
          onReload={async () => {
            await refreshConfig();
            await flushQueue();
            setMenu("closed");
            backToTable();
          }}
          onPrepareUnpair={prepareUnpair}
          onUnpair={unpairHere}
        />
      ) : null}
    </div>
  );
}

function AttractScreen({
  config,
  brandBg,
  brandInk,
  onStart,
}: {
  config: KioskConfig | null;
  brandBg: string;
  brandInk: string;
  onStart: () => void;
}) {
  const r = config?.restaurant;
  const paused = r && !r.active;
  const noSurvey = r && r.active && !config?.survey;
  const ready = !!config?.survey && !paused;

  return (
    <button
      type="button"
      onClick={ready ? onStart : undefined}
      disabled={!ready}
      style={{ background: ready ? brandBg : "var(--color-paper)", color: ready ? brandInk : "var(--color-ink)" }}
      className="flex h-full w-full flex-col items-center justify-between px-8 py-10 text-center"
      aria-label={ready ? "Toca para comenzar la encuesta" : undefined}
    >
      <div className="flex items-center gap-3">
        {r?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.logoUrl} alt="" className="h-14 w-14 rounded-xl bg-white/90 object-contain p-1" />
        ) : null}
        <span className="font-display text-2xl font-semibold">{r?.name ?? ""}</span>
      </div>

      {ready ? (
        <div className="max-w-3xl">
          <p className="font-display text-[clamp(44px,8vw,96px)] font-semibold leading-[0.98]">¿Cómo estuvo todo hoy?</p>
          {config?.survey?.welcomeText ? (
            <p className="mx-auto mt-6 max-w-xl text-xl opacity-85 sm:text-2xl">{config.survey.welcomeText}</p>
          ) : null}
        </div>
      ) : (
        <div className="max-w-xl">
          <p className="font-display text-4xl font-semibold">
            {!config ? "Sin conexión" : paused ? "Encuestas en pausa" : noSurvey ? "Encuesta no disponible" : ""}
          </p>
          <p className="mt-3 text-lg text-ink-soft">
            {!config
              ? "Conecta la tablet a internet para descargar la encuesta."
              : paused
                ? "Este restaurante está desactivado en el panel."
                : "Publica una encuesta para este restaurante desde el panel. La tablet la tomará sola."}
          </p>
        </div>
      )}

      {ready ? (
        <span
          className="inline-flex h-16 items-center rounded-full px-12 font-display text-2xl font-semibold motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]"
          style={{ background: brandInk, color: brandBg }}
        >
          Toca para comenzar
        </span>
      ) : (
        <span />
      )}
    </button>
  );
}

/** Pantalla de espera, para el mesero: número de mesa, o "Sin mesa" para no detenerse. */
function TableScreen({
  busy,
  paused,
  onActivity,
  onStart,
}: {
  busy: boolean;
  /** El menú del personal está abierto encima. */
  paused: boolean;
  onActivity: () => void;
  onStart: (table: string | null) => void;
}) {
  return (
    <main
      inert={paused}
      className="flex h-full flex-col items-center justify-center overflow-y-auto bg-paper px-6 py-10"
      onPointerDown={onActivity}
      onKeyDown={onActivity}
    >
      <h1 className="text-center font-display text-4xl font-semibold">¿Mesa?</h1>
      <p className="mt-3 mb-8 max-w-md text-center text-lg text-ink-soft">
        Escribe el número de mesa y entrega la tablet al comensal.
      </p>
      <Keypad
        length={1}
        maxLength={TABLE_MAX_DIGITS}
        submitLabel="Comenzar"
        busy={busy}
        busyLabel="Un momento…"
        disabled={paused}
        // "05" y "5" son la misma mesa: se guarda sin ceros a la izquierda para que el filtro la encuentre.
        onSubmit={(v) => onStart(v.replace(/^0+(?=\d)/, ""))}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => onStart(null)}
          className="mt-3 h-14 w-full rounded-2xl border border-line bg-surface text-lg font-medium text-ink disabled:opacity-40"
        >
          Sin mesa
        </button>
      </Keypad>
    </main>
  );
}

function PairScreen({ onPaired, notice }: { onPaired: (token: string) => Promise<void>; notice: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 py-10">
      <h1 className="text-center font-display text-4xl font-semibold">Vincular tablet</h1>
      <p className="mt-3 mb-8 max-w-md text-center text-lg text-ink-soft">
        {notice ?? "En el panel, entra a Tablets, toca “Agregar tablet” y escribe aquí el código de 6 dígitos."}
      </p>
      <Keypad
        length={6}
        submitLabel="Vincular"
        error={error}
        busy={busy}
        onSubmit={async (code) => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/kiosk/pair", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
            if (!res.ok || !data.token) {
              setError(data.error ?? "No se pudo vincular.");
              return;
            }
            await onPaired(data.token);
          } catch {
            setError("Sin conexión. Revisa el internet de la tablet.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </main>
  );
}

/** Esquina superior izquierda: mantener presionada 3 s abre el menú del personal. */
function SecretCorner({ onTrigger }: { onTrigger: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <div
      aria-hidden
      className="absolute top-0 left-0 z-40 h-20 w-20"
      onPointerDown={() => {
        cancel();
        timer.current = setTimeout(onTrigger, SECRET_HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

function StatusDot({ online, pending }: { online: boolean; pending: number }) {
  if (online && pending === 0) return null;
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-30 flex items-center gap-2 rounded-full bg-ink/70 px-3 py-1 text-[13px] text-white">
      <span className={`h-2 w-2 rounded-full ${online ? "bg-mustard" : "bg-chile"}`} />
      {online ? "" : "Sin internet"}
      {pending > 0 ? `${online ? "" : " · "}${pending} por enviar` : ""}
    </div>
  );
}

function StaffMenu({
  stage,
  config,
  pending,
  onClose,
  onUnlocked,
  onReload,
  onPrepareUnpair,
  onUnpair,
}: {
  stage: "pin" | "open" | "unpair";
  /** null si la tablet tiene token pero nunca pudo descargar su configuración. */
  config: KioskConfig | null;
  pending: number;
  onClose: () => void;
  onUnlocked: () => void;
  onReload: () => void;
  /** Intenta enviar la cola y devuelve cuántas respuestas siguen sin enviar. */
  onPrepareUnpair: () => Promise<number>;
  onUnpair: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [isFullscreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  // Desvincular: primero se intenta enviar la cola ("sending") y luego se confirma, con lo que se perdería.
  const [unpairing, setUnpairing] = useState<"no" | "sending" | "confirm" | "working">(stage === "unpair" ? "sending" : "no");
  const [lost, setLost] = useState(0);

  const startUnpair = useCallback(async () => {
    setUnpairing("sending");
    setLost(await onPrepareUnpair());
    setUnpairing("confirm");
  }, [onPrepareUnpair]);

  const startedInUnpair = useRef(stage === "unpair");
  useEffect(() => {
    if (!startedInUnpair.current) return;
    startedInUnpair.current = false;
    void onPrepareUnpair().then((left) => {
      setLost(left);
      setUnpairing("confirm");
    });
  }, [onPrepareUnpair]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Menú del personal"
    >
      <div className="w-full max-w-md rounded-3xl bg-paper p-6 shadow-2xl">
        {unpairing !== "no" ? (
          <>
            <h2 className="font-display text-2xl font-semibold">Desvincular esta tablet</h2>
            {unpairing === "sending" ? (
              <p className="mt-4 text-[17px] text-ink-soft">Enviando las respuestas pendientes…</p>
            ) : (
              <>
                {lost > 0 ? (
                  <p className="mt-4 rounded-2xl border border-chile/30 p-4 text-[17px] font-medium text-chile">
                    {lost === 1
                      ? "No se pudo enviar 1 respuesta. Si desvinculas ahora, se pierde."
                      : `No se pudieron enviar ${lost} respuestas. Si desvinculas ahora, se pierden.`}
                  </p>
                ) : null}
                <p className="mt-4 text-[17px] text-ink-soft">
                  La tablet dejará de mostrar la encuesta y volverá a pedir un código. Podrás vincularla de nuevo con un código
                  de este u otro restaurante.
                </p>
                <div className="mt-6 grid gap-3">
                  <MenuButton
                    tone="danger"
                    disabled={unpairing === "working"}
                    onClick={() => {
                      setUnpairing("working");
                      void onUnpair();
                    }}
                  >
                    {unpairing === "working" ? "Desvinculando…" : lost > 0 ? "Desvincular de todos modos" : "Sí, desvincular"}
                  </MenuButton>
                </div>
              </>
            )}
          </>
        ) : stage === "pin" && config ? (
          <>
            <h2 className="mb-6 text-center font-display text-2xl font-semibold">PIN del personal</h2>
            <Keypad
              length={4}
              maxLength={6}
              masked
              submitLabel="Entrar"
              error={error}
              busy={tries >= 5}
              onSubmit={async (pin) => {
                const h = await hashPin(config.restaurant.id, pin);
                if (h === config.restaurant.pinHash) onUnlocked();
                else {
                  const t = tries + 1;
                  setTries(t);
                  setError(t >= 5 ? "Demasiados intentos. Espera 30 segundos." : "PIN incorrecto");
                  if (t >= 5)
                    setTimeout(() => {
                      setTries(0);
                      setError(null);
                    }, 30_000);
                }
              }}
            />
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-semibold">Menú del personal</h2>
            <dl className="mt-4 space-y-1 text-[15px] text-ink-soft">
              <div>
                <dt className="inline">Tablet: </dt>
                <dd className="inline font-medium text-ink">{config?.device.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="inline">Restaurante: </dt>
                <dd className="inline font-medium text-ink">{config?.restaurant.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="inline">Respuestas por enviar: </dt>
                <dd className="inline font-medium text-ink">{pending}</dd>
              </div>
            </dl>
            <div className="mt-6 grid gap-3">
              <MenuButton onClick={onReload}>Actualizar encuesta y enviar pendientes</MenuButton>
              {isFullscreen ? (
                <MenuButton
                  onClick={() => {
                    void document.exitFullscreen();
                    onClose();
                  }}
                >
                  Salir de pantalla completa
                </MenuButton>
              ) : null}
              <MenuButton onClick={() => void startUnpair()} tone="danger">
                Desvincular esta tablet
              </MenuButton>
            </div>
          </>
        )}
        <button type="button" onClick={onClose} className="mt-5 h-12 w-full rounded-2xl text-lg text-ink-soft hover:bg-line-soft">
          {unpairing === "no" ? "Cerrar" : "Cancelar"}
        </button>
      </div>
    </div>
  );
}

function MenuButton({ tone, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "danger" }) {
  return (
    <button
      type="button"
      className={`h-14 w-full rounded-2xl border px-4 text-left text-lg font-medium ${
        tone === "danger" ? "border-chile/30 text-chile" : "border-line bg-surface text-ink"
      }`}
      {...props}
    />
  );
}
