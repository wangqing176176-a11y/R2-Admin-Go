"use client";

import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { BadgeInfo, BookOpen, Eye, EyeOff, Hash, LockKeyhole, Mail, Menu, ShieldCheck, X } from "lucide-react";
import Modal from "@/components/Modal";
import { LEGAL_DOCS, LEGAL_TAB_LABELS, LEGAL_TAB_ORDER, type LegalTabKey } from "@/lib/legal-docs";
import landingLogo from "../landing page/logo.png";
import landingBg from "../landing page/beijingtu.png";

type AuthLandingPageProps = {
  loading: boolean;
  formEmail: string;
  setFormEmail: Dispatch<SetStateAction<string>>;
  formPassword: string;
  setFormPassword: Dispatch<SetStateAction<string>>;
  registerEmail: string;
  setRegisterEmail: Dispatch<SetStateAction<string>>;
  registerPassword: string;
  setRegisterPassword: Dispatch<SetStateAction<string>>;
  registerCode: string;
  setRegisterCode: Dispatch<SetStateAction<string>>;
  registerAgree: boolean;
  setRegisterAgree: Dispatch<SetStateAction<boolean>>;
  rememberMe: boolean;
  setRememberMe: Dispatch<SetStateAction<boolean>>;
  loginNotice: string;
  registerNotice: string;
  registerCodeCooldown: number;
  forgotOpen: boolean;
  setForgotOpen: Dispatch<SetStateAction<boolean>>;
  forgotEmail: string;
  setForgotEmail: Dispatch<SetStateAction<string>>;
  forgotCode: string;
  setForgotCode: Dispatch<SetStateAction<string>>;
  forgotNotice: string;
  forgotCodeCooldown: number;
  resetPasswordOpen: boolean;
  setResetPasswordOpen: Dispatch<SetStateAction<boolean>>;
  resetPasswordValue: string;
  setResetPasswordValue: Dispatch<SetStateAction<string>>;
  resetPasswordConfirmValue: string;
  setResetPasswordConfirmValue: Dispatch<SetStateAction<string>>;
  onLogin: (e: React.FormEvent) => Promise<void>;
  onRegister: (e?: React.FormEvent) => Promise<void>;
  onSendRegisterCode: () => Promise<void>;
  onSendRecoveryCode: () => Promise<void>;
  onVerifyRecoveryCode: () => Promise<void>;
  onResetPasswordFromRecovery: () => Promise<void>;
  onOpenForgot: () => void;
};

const WARNING_TEXT =
  "请遵守网络安全与相关法律法规，严禁通过本平台上传、存储、分享、传输任何违法违规、侵权及不良信息数据，共同维护安全合规的文件管理环境。";

const NAV_LINKS = [
  { label: "功能", href: "./404.html", icon: "dashboard" as const },
  { label: "配置", href: "https://qinghub.top/docs/r2-admin-go%E9%85%8D%E7%BD%AE%E8%AF%B4%E6%98%8E/", icon: "settings" as const },
  { label: "联系", href: "mailto:wangqing176176@gmail.com", icon: "mail" as const },
] as const;

export default function AuthLandingPage({
  loading,
  formEmail,
  setFormEmail,
  formPassword,
  setFormPassword,
  registerEmail,
  setRegisterEmail,
  registerPassword,
  setRegisterPassword,
  registerCode,
  setRegisterCode,
  registerAgree,
  setRegisterAgree,
  rememberMe,
  setRememberMe,
  loginNotice,
  registerNotice,
  registerCodeCooldown,
  forgotOpen,
  setForgotOpen,
  forgotEmail,
  setForgotEmail,
  forgotCode,
  setForgotCode,
  forgotNotice,
  forgotCodeCooldown,
  resetPasswordOpen,
  setResetPasswordOpen,
  resetPasswordValue,
  setResetPasswordValue,
  resetPasswordConfirmValue,
  setResetPasswordConfirmValue,
  onLogin,
  onRegister,
  onSendRegisterCode,
  onSendRecoveryCode,
  onVerifyRecoveryCode,
  onResetPasswordFromRecovery,
  onOpenForgot,
}: AuthLandingPageProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalActiveTab, setLegalActiveTab] = useState<LegalTabKey>("terms");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-auth-nav-root]")) return;
      setNavOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [navOpen]);

  const activeLegalDoc = LEGAL_DOCS[legalActiveTab].replace(/^\s*#{1,6}\s*/gm, "");
  const activeLegalDocLines = activeLegalDoc.split("\n");
  const isLegalWarningLine = (line: string) => /^\s*【重点(?:提示|红线)】/.test(line);
  const getLegalLineText = (line: string) => line.replace(/^\s*【重点(?:提示|红线)】\s*/, "");
  const authTitle = registerMode ? "注册账号" : "欢迎使用";
  const authSwitchText = registerMode ? "已有账号？" : "还没有账号？";
  const authSwitchAction = registerMode ? "去登陆" : "立即注册";

  const openTermsModal = (tab: LegalTabKey = "terms") => {
    setLegalActiveTab(tab);
    setLegalModalOpen(true);
  };

  return (
    <main
      className="min-h-dvh overflow-x-hidden text-[#172033]"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.08) 44%, rgba(255,255,255,0) 100%), rgba(8,16,32,0.08), url(${landingBg.src})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="fixed inset-0 -z-10 bg-white/10" aria-hidden="true" />

      <header className="fixed left-0 right-0 top-0 z-30 border-b border-white/80 bg-white/84 px-5 py-2 shadow-[0_10px_30px_rgba(23,32,51,0.08)] backdrop-blur-[18px] backdrop-saturate-150 sm:px-[clamp(20px,4vw,64px)]">
        <div className="mx-auto flex min-h-[58px] items-center justify-between gap-4">
          <a className="inline-flex min-w-[160px] items-center" href="#" aria-label="返回首页">
            <img src={landingLogo.src} alt="R2 Admin Go" className="block h-12 w-auto max-w-[250px] object-contain" draggable={false} />
          </a>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-blue-100 bg-white/80 lg:hidden"
            aria-label={navOpen ? "关闭导航菜单" : "打开导航菜单"}
            aria-expanded={navOpen}
            aria-controls="authNav"
            onClick={() => setNavOpen((v) => !v)}
            data-auth-nav-root
          >
            {navOpen ? <X className="h-5 w-5 text-[#273249]" /> : <Menu className="h-5 w-5 text-[#273249]" />}
          </button>

          <nav
            id="authNav"
            data-auth-nav-root
            className={[
              "absolute left-5 right-5 top-[70px] rounded-2xl border border-white/80 bg-white/95 p-2 shadow-[0_20px_40px_rgba(23,32,51,0.14)] backdrop-blur-xl lg:static lg:mx-0 lg:flex lg:items-center lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-0",
              navOpen ? "block" : "hidden lg:flex",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="主导航"
          >
            <a
              className="flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2 text-center text-sm text-[#273249] transition-colors hover:bg-white/64 hover:text-blue-600 lg:min-w-[68px]"
              href="#"
              title="严禁传输涉黄、侵权等违法违规数据、文件或媒体"
              onClick={() => setNavOpen(false)}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center text-red-600">!</span>
              <span className="hidden max-w-[17em] overflow-hidden whitespace-nowrap xl:inline-block">{WARNING_TEXT}</span>
            </a>
            {NAV_LINKS.map((item) => {
              const icon =
                item.icon === "dashboard" ? (
                  <BadgeInfo className="h-4 w-4" />
                ) : item.icon === "settings" ? (
                  <BookOpen className="h-4 w-4" />
                ) : (
                  <Mail className="h-4 w-4" />
                );
              return (
                <a
                  key={item.label}
                  href={item.href}
                  target={item.href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={item.href.startsWith("mailto:") ? undefined : "noreferrer"}
                  className="flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2 text-center text-sm text-[#273249] transition-colors hover:bg-white/64 hover:text-blue-600 lg:min-w-[68px]"
                  onClick={() => setNavOpen(false)}
                >
                  <span className="text-inherit">{icon}</span>
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mt-[58px] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-[clamp(20px,4vw,64px)]">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-4 rounded-[16px] border border-red-200 bg-white/80 px-4 py-3 text-sm text-red-700 shadow-sm backdrop-blur lg:hidden">
            {WARNING_TEXT}
          </div>

          <section className="w-full max-w-[392px] rounded-[20px] border border-white/56 bg-white/58 p-7 shadow-[0_24px_70px_rgba(18,34,68,0.18)] backdrop-blur-[18px] backdrop-saturate-150 sm:p-[30px]">
            <div className="mb-5">
              <h1 className="m-0 text-[26px] font-bold leading-[1.2] tracking-tight text-[#172033] title-animate">{authTitle}</h1>
            </div>

            {!registerMode ? (
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  void onLogin(e);
                }}
              >
                <label className="grid gap-2">
                  <span className="text-sm font-normal text-[#17191d]">邮箱账号</span>
                  <span className="flex h-12 items-center rounded-[10px] border border-white/66 bg-[rgba(248,251,255,0.82)] px-3 transition-colors focus-within:border-blue-600 focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]">
                    <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center text-[#111417]">
                      <Mail className="h-5 w-5" />
                    </span>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => {
                        setFormEmail(e.target.value);
                      }}
                      placeholder="请输入邮箱账号"
                      autoComplete="email"
                      className="h-full w-full min-w-0 border-0 bg-transparent pl-3 text-[15px] outline-none placeholder:text-[#8a8f98]"
                    />
                  </span>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-normal text-[#17191d]">登陆密码</span>
                  <span className="flex h-12 items-center rounded-[10px] border border-white/66 bg-[rgba(248,251,255,0.82)] px-3 transition-colors focus-within:border-blue-600 focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]">
                    <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center text-[#111417]">
                      <LockKeyhole className="h-5 w-5" />
                    </span>
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      value={formPassword}
                      onChange={(e) => {
                        setFormPassword(e.target.value);
                      }}
                      placeholder="请输入登陆密码"
                      autoComplete="current-password"
                      className="h-full w-full min-w-0 border-0 bg-transparent pl-3 pr-2 text-[15px] outline-none placeholder:text-[#8a8f98]"
                    />
                    <button
                      type="button"
                      aria-label={showLoginPassword ? "隐藏密码" : "显示密码"}
                      className="inline-flex h-8 w-8 items-center justify-center opacity-70 transition-opacity hover:opacity-100"
                      onClick={() => setShowLoginPassword((v) => !v)}
                    >
                      {showLoginPassword ? <EyeOff className="h-5 w-5 text-[#7b8190]" /> : <Eye className="h-5 w-5 text-[#7b8190]" />}
                    </button>
                  </span>
                </label>

                <div className="mt-0 flex items-start justify-between gap-3 py-0">
                  <label className="inline-flex items-center gap-2 text-sm leading-5 text-[#17191d]">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 appearance-none rounded-[3px] border border-[#7b8190] bg-[rgba(255,255,255,0.86)] checked:border-blue-600 checked:bg-blue-600"
                    />
                    <span>记住登陆状态</span>
                  </label>
                  <button
                    type="button"
                    className="shrink-0 text-sm leading-5 text-[#17191d] transition-colors hover:text-blue-600"
                    onClick={onOpenForgot}
                  >
                    忘记密码
                  </button>
                </div>

                {loginNotice ? <p className="min-h-6 text-sm leading-tight text-red-600">{loginNotice}</p> : <div className="min-h-6" aria-hidden="true" />}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-500/75"
                >
                  {loading ? <span className="inline-flex items-center gap-2">正在登录 <span className="r2-loader-dots text-white"><span /><span /><span /></span></span> : <><ShieldCheck className="h-5 w-5" />进入管理</>}
                </button>

                <p className="mt-1 text-center text-sm text-[#17191d]">
                  还没有账号？
                  <button
                    type="button"
                    className="ml-1 text-blue-600 transition-colors hover:text-blue-700"
                    onClick={() => {
                      setRegisterMode(true);
                    }}
                  >
                    立即注册
                  </button>
                </p>
              </form>
            ) : (
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  void onRegister(e);
                }}
              >
                <label className="grid gap-2">
                  <span className="text-sm font-normal text-[#17191d]">邮箱账号</span>
                  <span className="flex h-12 items-center rounded-[10px] border border-white/66 bg-[rgba(248,251,255,0.82)] px-3 transition-colors focus-within:border-blue-600 focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]">
                    <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center text-[#111417]">
                      <Mail className="h-5 w-5" />
                    </span>
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="请输入邮箱账号"
                      autoComplete="email"
                      className="h-full w-full min-w-0 border-0 bg-transparent pl-3 text-[15px] outline-none placeholder:text-[#8a8f98]"
                    />
                  </span>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-normal text-[#17191d]">登陆密码</span>
                  <span className="flex h-12 items-center rounded-[10px] border border-white/66 bg-[rgba(248,251,255,0.82)] px-3 transition-colors focus-within:border-blue-600 focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]">
                    <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center text-[#111417]">
                      <LockKeyhole className="h-5 w-5" />
                    </span>
                    <input
                      type={showRegisterPassword ? "text" : "password"}
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="请设置登陆密码"
                      autoComplete="new-password"
                      className="h-full w-full min-w-0 border-0 bg-transparent pl-3 pr-2 text-[15px] outline-none placeholder:text-[#8a8f98]"
                    />
                    <button
                      type="button"
                      aria-label={showRegisterPassword ? "隐藏密码" : "显示密码"}
                      className="inline-flex h-8 w-8 items-center justify-center opacity-70 transition-opacity hover:opacity-100"
                      onClick={() => setShowRegisterPassword((v) => !v)}
                    >
                      {showRegisterPassword ? <EyeOff className="h-5 w-5 text-[#7b8190]" /> : <Eye className="h-5 w-5 text-[#7b8190]" />}
                    </button>
                  </span>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-normal text-[#17191d]">邮箱验证码</span>
                  <span className="flex h-12 items-center rounded-[10px] border border-white/66 bg-[rgba(248,251,255,0.82)] px-3 transition-colors focus-within:border-blue-600 focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]">
                    <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center text-[#111417]">
                      <Hash className="h-5 w-5" />
                    </span>
                    <input
                      type="text"
                      value={registerCode}
                      onChange={(e) => setRegisterCode(e.target.value.replace(/\s+/g, ""))}
                      placeholder="请输入验证码"
                      inputMode="numeric"
                      className="h-full w-full min-w-0 border-0 bg-transparent pl-3 text-[15px] outline-none placeholder:text-[#8a8f98]"
                    />
                    <button
                      type="button"
                      className="ml-2 inline-flex h-8 min-w-[96px] items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-3 text-[13px] font-normal text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-[rgba(138,146,163,0.12)] disabled:text-[#7b8190]"
                      onClick={() => {
                        void onSendRegisterCode();
                      }}
                      disabled={loading || registerCodeCooldown > 0}
                    >
                      {registerCodeCooldown > 0 ? `${registerCodeCooldown}s 后重发` : "发送验证码"}
                    </button>
                  </span>
                </label>

                <label className="inline-flex items-start gap-2 text-sm leading-5 text-[#17191d]">
                  <input
                    type="checkbox"
                    checked={registerAgree}
                    onChange={(e) => setRegisterAgree(e.target.checked)}
                    className="mt-0.5 h-4 w-4 appearance-none rounded-[3px] border border-[#7b8190] bg-[rgba(255,255,255,0.86)] checked:border-blue-600 checked:bg-blue-600"
                  />
                  <span>
                    我已阅读并同意
                    <button
                      type="button"
                      className="ml-1 text-blue-600 transition-colors hover:text-blue-700"
                      onClick={() => openTermsModal("terms")}
                    >
                      「本站全部条款」
                    </button>
                  </span>
                </label>

                {registerNotice ? <p className="min-h-6 text-sm leading-tight text-red-600">{registerNotice}</p> : <div className="min-h-6" aria-hidden="true" />}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-500/75"
                >
                  {loading ? <span className="inline-flex items-center gap-2">正在提交注册信息 <span className="r2-loader-dots text-white"><span /><span /><span /></span></span> : <><ShieldCheck className="h-5 w-5" />完成注册</>}
                </button>

                <p className="mt-1 text-center text-sm text-[#17191d]">
                  {authSwitchText}
                  <button
                    type="button"
                    className="ml-1 text-blue-600 transition-colors hover:text-blue-700"
                    onClick={() => {
                      setRegisterMode(false);
                    }}
                  >
                    {authSwitchAction}
                  </button>
                </p>
              </form>
            )}
          </section>
        </div>
      </div>

      <footer className="px-5 pb-10 pt-6 text-center text-sm text-[#6c7384] sm:px-[clamp(20px,4vw,64px)]">
        © 2026 R2 Admin Go by Wang Qing. All rights reserved.
      </footer>

      <Modal
        open={legalModalOpen}
        title="本站条款与协议"
        description="请阅读并确认相关条款内容。"
        onClose={() => setLegalModalOpen(false)}
        closeOnBackdropClick={false}
        panelClassName="max-w-4xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                window.location.assign("/404");
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              不同意
            </button>
            <button
              onClick={() => {
                setRegisterAgree(true);
                setLegalModalOpen(false);
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              我已阅读理解并同意全部条款
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
            {LEGAL_TAB_ORDER.map((tab) => {
              const active = legalActiveTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLegalActiveTab(tab)}
                  className={[
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {LEGAL_TAB_LABELS[tab]}
                </button>
              );
            })}
          </div>
          <div className="max-h-[56vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-gray-50 p-4 text-sm leading-7 text-gray-700 dark:bg-gray-950/40 dark:text-gray-200">
            {activeLegalDocLines.map((line, idx) =>
              isLegalWarningLine(line) ? (
                <p key={`${legalActiveTab}-${idx}`} className="font-semibold text-red-600 dark:text-red-300">
                  {getLegalLineText(line)}
                </p>
              ) : (
                <p key={`${legalActiveTab}-${idx}`}>{line || "\u00a0"}</p>
              ),
            )}
          </div>
        </div>
      </Modal>

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
                void onVerifyRecoveryCode();
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
              onChange={(e) => {
                setForgotEmail(e.target.value);
              }}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
              placeholder="请输入注册邮箱"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">邮箱验证码</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={forgotCode}
                onChange={(e) => {
                  setForgotCode(e.target.value.replace(/\s+/g, ""));
                }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                placeholder="请输入重置验证码"
              />
              <button
                type="button"
                onClick={() => {
                  void onSendRecoveryCode();
                }}
                disabled={loading || forgotCodeCooldown > 0}
                className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/40"
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
                void onResetPasswordFromRecovery();
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
              placeholder="至少六位密码"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">确认新密码</label>
            <input
              type="password"
              value={resetPasswordConfirmValue}
              onChange={(e) => setResetPasswordConfirmValue(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
              placeholder="再次输入新密码"
            />
          </div>
        </div>
      </Modal>
    </main>
  );
}
