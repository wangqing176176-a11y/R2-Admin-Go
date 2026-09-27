"use client";

import { useSyncExternalStore } from "react";

export type LoadingTestMode =
  | "off"
  | "all"
  | "search"
  | "file-list"
  | "page"
  | "save"
  | "action"
  | "modal-loading"
  | "modal-busy";

let currentMode: LoadingTestMode = "off";
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => currentMode;

export const setLoadingTestMode = (mode: LoadingTestMode) => {
  if (currentMode === mode) return;
  currentMode = mode;
  listeners.forEach((listener) => listener());
};

export const useLoadingTestMode = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
