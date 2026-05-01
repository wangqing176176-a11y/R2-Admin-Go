"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";

type SubmitResult = { ok: boolean; message?: string };

type AuthLandingPageIframeProps = {
  loading: boolean;
  loginNotice: string;
  registerNotice: string;
  registerCodeCooldown: number;
  forgotOpen: boolean;
  forgotEmail: string;
  forgotCode: string;
  forgotNotice: string;
  forgotCodeCooldown: number;
  resetPasswordOpen: boolean;
  resetPasswordValue: string;
  resetPasswordConfirmValue: string;
  setForgotOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setForgotEmail: React.Dispatch<React.SetStateAction<string>>;
  setForgotCode: React.Dispatch<React.SetStateAction<string>>;
  setResetPasswordOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setResetPasswordValue: React.Dispatch<React.SetStateAction<string>>;
  setResetPasswordConfirmValue: React.Dispatch<React.SetStateAction<string>>;
  onOpenForgot: (email: string) => void;
  submitLogin: (payload: { email: string; password: string; rememberMe: boolean }) => Promise<SubmitResult>;
  submitRegister: (payload: { email: string; password: string; code: string; agree: boolean }) => Promise<SubmitResult>;
  submitSendRegisterCode: (payload: { email: string; password: string; agree: boolean }) => Promise<SubmitResult>;
  submitSendRecoveryCode: (payload: { email: string }) => Promise<SubmitResult>;
  submitVerifyRecoveryCode: (payload: { email: string; code: string }) => Promise<SubmitResult>;
  submitResetPasswordFromRecovery: (payload: { password: string; confirm: string }) => Promise<SubmitResult>;
};

const setMessage = (element: HTMLElement | null, text: string) => {
  if (!element) return;
  element.textContent = text;
  element.hidden = !text;
};

export default function AuthLandingPageIframe({
  loading,
  loginNotice,
  registerNotice,
  registerCodeCooldown,
  forgotOpen,
  forgotEmail,
  forgotCode,
  forgotNotice,
  forgotCodeCooldown,
  resetPasswordOpen,
  resetPasswordValue,
  resetPasswordConfirmValue,
  setForgotOpen,
  setForgotEmail,
  setForgotCode,
  setResetPasswordOpen,
  setResetPasswordValue,
  setResetPasswordConfirmValue,
  onOpenForgot,
  submitLogin,
  submitRegister,
  submitSendRegisterCode,
  submitSendRecoveryCode,
  submitVerifyRecoveryCode,
  submitResetPasswordFromRecovery,
}: AuthLandingPageIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const bridgeCleanupRef = useRef<(() => void) | null>(null);

  const iframeSrc = useMemo(() => "/landing-page/index.html?v=20260501", []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    const attachBridge = () => {
      if (cancelled) return;
      const doc = iframe.contentDocument;
      if (!doc) {
        window.setTimeout(attachBridge, 50);
        return;
      }

      const loginForm = doc.querySelector<HTMLFormElement>("#loginForm");
      const registerForm = doc.querySelector<HTMLFormElement>("#registerForm");
      const loginMessage = doc.querySelector<HTMLElement>("#loginMessage");
      const registerMessage = doc.querySelector<HTMLElement>("#registerMessage");
      const sendCodeButton = doc.querySelector<HTMLButtonElement>("#sendCode");
      const forgotLink = doc.querySelector<HTMLAnchorElement>(".form-row .text-link");
      const loginSubmitButton = doc.querySelector<HTMLButtonElement>("#loginForm .primary-button");
      const registerSubmitButton = doc.querySelector<HTMLButtonElement>("#registerForm .primary-button");

      if (!loginForm || !registerForm || !loginMessage || !registerMessage || !sendCodeButton || !forgotLink || !loginSubmitButton || !registerSubmitButton) {
        window.setTimeout(attachBridge, 50);
        return;
      }

      const syncText = () => {
        setMessage(loginMessage, loginNotice);
        setMessage(registerMessage, registerNotice);
        sendCodeButton.disabled = loading || registerCodeCooldown > 0;
        sendCodeButton.textContent = registerCodeCooldown > 0 ? `${registerCodeCooldown}s 后重发` : "发送验证码";
        loginSubmitButton.disabled = loading;
        registerSubmitButton.disabled = loading;
      };

      const stop = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      };

      const onLoginSubmit = async (event: Event) => {
        stop(event);
        const email = doc.querySelector<HTMLInputElement>('input[name="loginEmail"]')?.value.trim() ?? "";
        const password = doc.querySelector<HTMLInputElement>('input[name="loginPassword"]')?.value.trim() ?? "";
        const rememberMe = doc.querySelector<HTMLInputElement>('input[name="remember"]')?.checked ?? false;
        if (!email || !password) {
          setMessage(loginMessage, "请输入邮箱和密码");
          return;
        }
        const result = await submitLogin({ email, password, rememberMe });
        setMessage(loginMessage, result.ok ? "" : result.message ?? "登录失败，请重试。");
      };

      const onRegisterSubmit = async (event: Event) => {
        stop(event);
        const email = doc.querySelector<HTMLInputElement>('input[name="registerEmail"]')?.value.trim() ?? "";
        const password = doc.querySelector<HTMLInputElement>('input[name="registerPassword"]')?.value.trim() ?? "";
        const code = doc.querySelector<HTMLInputElement>('input[name="emailCode"]')?.value.trim() ?? "";
        const agree = doc.querySelector<HTMLInputElement>('#agreementCheckbox')?.checked ?? false;
        const result = await submitRegister({ email, password, code, agree });
        setMessage(registerMessage, result.ok ? "" : result.message ?? "注册失败，请重试。");
      };

      const onSendRegisterCode = async (event: Event) => {
        stop(event);
        const email = doc.querySelector<HTMLInputElement>('input[name="registerEmail"]')?.value.trim() ?? "";
        const password = doc.querySelector<HTMLInputElement>('input[name="registerPassword"]')?.value.trim() ?? "";
        const agree = doc.querySelector<HTMLInputElement>('#agreementCheckbox')?.checked ?? false;
        const result = await submitSendRegisterCode({ email, password, agree });
        setMessage(registerMessage, result.ok ? "注册验证码已发送，请查收邮箱" : result.message ?? "发送注册验证码失败，请重试。");
        syncText();
      };

      const onForgotLinkClick = (event: Event) => {
        stop(event);
        const email = doc.querySelector<HTMLInputElement>('input[name="loginEmail"]')?.value.trim() ?? "";
        onOpenForgot(email);
      };

      loginForm.addEventListener("submit", onLoginSubmit, true);
      registerForm.addEventListener("submit", onRegisterSubmit, true);
      loginSubmitButton.addEventListener("click", onLoginSubmit, true);
      registerSubmitButton.addEventListener("click", onRegisterSubmit, true);
      sendCodeButton.addEventListener("click", onSendRegisterCode, true);
      forgotLink.addEventListener("click", onForgotLinkClick, true);

      bridgeCleanupRef.current?.();
      bridgeCleanupRef.current = () => {
        loginForm.removeEventListener("submit", onLoginSubmit, true);
        registerForm.removeEventListener("submit", onRegisterSubmit, true);
        loginSubmitButton.removeEventListener("click", onLoginSubmit, true);
        registerSubmitButton.removeEventListener("click", onRegisterSubmit, true);
        sendCodeButton.removeEventListener("click", onSendRegisterCode, true);
        forgotLink.removeEventListener("click", onForgotLinkClick, true);
      };

      syncText();
    };

    attachBridge();

    return () => {
      cancelled = true;
      bridgeCleanupRef.current?.();
      bridgeCleanupRef.current = null;
    };
  }, [iframeLoaded, loading, loginNotice, registerNotice, registerCodeCooldown, submitLogin, submitRegister, submitSendRegisterCode, submitSendRecoveryCode, onOpenForgot]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframeLoaded) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const loginMessage = doc.querySelector<HTMLElement>("#loginMessage");
    const registerMessage = doc.querySelector<HTMLElement>("#registerMessage");
    setMessage(loginMessage, loginNotice);
    setMessage(registerMessage, registerNotice);
  }, [iframeLoaded, loginNotice, registerNotice]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframeLoaded) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const sendCodeButton = doc.querySelector<HTMLButtonElement>("#sendCode");
    if (!sendCodeButton) return;
    sendCodeButton.disabled = loading || registerCodeCooldown > 0;
    sendCodeButton.textContent = registerCodeCooldown > 0 ? `${registerCodeCooldown}s 后重发` : "发送验证码";
  }, [iframeLoaded, loading, registerCodeCooldown]);

  return (
    <>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="R2 Admin Go 登录注册页面"
        className="block h-dvh w-full border-0"
        onLoad={() => setIframeLoaded(true)}
        allow="clipboard-read; clipboard-write"
      />

      {loading ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/45 backdrop-blur-[2px]">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-cyan-200/70 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-lg dark:border-cyan-900/60 dark:bg-slate-900/90 dark:text-slate-100">
            <span className="r2-loader-orbit h-5 w-5" />
            <span className="inline-flex items-center gap-2">
              正在提交请求
              <span className="r2-loader-dots"><span /><span /><span /></span>
            </span>
          </div>
        </div>
      ) : null}

      <Modal
        open={forgotOpen}
        title="找回密码"
        description="输入注册邮箱并验证邮箱验证码，验证后可设置新密码。"
        onClose={() => setForgotOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setForgotOpen(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={() => {
                void submitVerifyRecoveryCode({ email: forgotEmail.trim(), code: forgotCode.trim() });
              }}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              验证并继续
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">注册邮箱</label>
            <input
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">邮箱验证码</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value.replace(/\s+/g, ""))}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => {
                  void submitSendRecoveryCode({ email: forgotEmail.trim() });
                }}
                disabled={loading || forgotCodeCooldown > 0}
                className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm font-medium text-blue-700 disabled:opacity-50"
              >
                {forgotCodeCooldown > 0 ? `${forgotCodeCooldown}s` : "发送验证码"}
              </button>
            </div>
          </div>
          {forgotNotice ? <div className="text-sm text-red-600 dark:text-red-300">{forgotNotice}</div> : null}
        </div>
      </Modal>

      <Modal
        open={resetPasswordOpen}
        title="设置新密码"
        description="请设置新的登录密码，设置完成后使用新密码登录。"
        onClose={() => setResetPasswordOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setResetPasswordOpen(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              稍后再说
            </button>
            <button
              onClick={() => {
                void submitResetPasswordFromRecovery({ password: resetPasswordValue.trim(), confirm: resetPasswordConfirmValue.trim() });
              }}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              保存新密码
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">新密码</label>
            <input
              type="password"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">确认新密码</label>
            <input
              type="password"
              value={resetPasswordConfirmValue}
              onChange={(e) => setResetPasswordConfirmValue(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
