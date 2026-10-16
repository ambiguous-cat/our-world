"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";

import type {
  AdminMutationResponse,
  AdminOverviewResponse,
  AdminPrize,
  AdminTicketType,
} from "@/modules/scratch/contracts/admin";
import { withBasePath } from "@/shared/routing/app-path";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import {
  ticketIcon,
  ticketIconOptions,
  type TicketIconKey,
} from "@/modules/scratch/contracts/ticket-icon";
import { resultMeta, type ResultKind } from "./data";
import { AdminHistory } from "./admin-history";
import { AdminRedemptions } from "./admin-redemptions";
import {
  prizeIconCategories,
  prizeIcons,
  type PrizeIconCategoryId,
} from "./prize-icons";

type AdminSection =
  | "tickets"
  | "prizes"
  | "redemptions"
  | "history";
type TicketWorkspaceTab = "balance" | "pool" | "retry";
type ProbabilityDraft = Record<ResultKind, string>;

type TicketForm = {
  id: number | null;
  name: string;
  description: string;
  kind: "permanent" | "limited";
  displayIcon: TicketIconKey;
  coverImagePath: string;
  drawBackgroundImagePath: string;
  themeColor: string;
  accentColor: string;
  scratchMaskColor: string;
  scratchTextColor: string;
  scratchPrompt: string;
  sortOrder: string;
  isGrantEnabled: boolean;
  isDrawEnabled: boolean;
};

type PrizeForm = {
  id: number | null;
  name: string;
  description: string;
  imagePath: string;
  imageFile: File | null;
  sortOrder: string;
  initialStock: string;
  isActive: boolean;
};

type PrizeImageUploadResponse = {
  imagePath: string;
};

const emptyTicketForm: TicketForm = {
  id: null,
  name: "",
  description: "",
  kind: "permanent",
  displayIcon: "ticket",
  coverImagePath: "",
  drawBackgroundImagePath: "/momo/scratch.jpg",
  themeColor: "#BFD9A8",
  accentColor: "#F3AFC1",
  scratchMaskColor: "#A8A9AD",
  scratchTextColor: "#FFFFFF",
  scratchPrompt: "刮开看看吧",
  sortOrder: "0",
  isGrantEnabled: true,
  isDrawEnabled: true,
};

const ticketImageOptions = [
  {
    label: "日常幸运",
    description: "清新的浅绿色日常款",
    path: "/momo/scratch.jpg",
    themeColor: "#BFD9A8",
    accentColor: "#F3AFC1",
    scratchMaskColor: "#A8A9AD",
    scratchTextColor: "#FFFFFF",
  },
  {
    label: "心动惊喜",
    description: "粉色爱心与闪光",
    path: "/momo/tickets/scratch-heart.webp",
    themeColor: "#F6C3CE",
    accentColor: "#EF7F9B",
    scratchMaskColor: "#D98CA3",
    scratchTextColor: "#FFFFFF",
  },
  {
    label: "生日快乐",
    description: "奶油色气球与彩纸",
    path: "/momo/tickets/scratch-birthday.webp",
    themeColor: "#F5DA83",
    accentColor: "#F39A7A",
    scratchMaskColor: "#D6A75C",
    scratchTextColor: "#FFFFFF",
  },
  {
    label: "七夕限定",
    description: "蓝紫星空与鹊桥",
    path: "/momo/tickets/scratch-qixi.webp",
    themeColor: "#7774CE",
    accentColor: "#F0A8CF",
    scratchMaskColor: "#7167AE",
    scratchTextColor: "#FFFFFF",
  },
] as const;

const emptyPrizeForm: PrizeForm = {
  id: null,
  name: "",
  description: "",
  imagePath: "",
  imageFile: null,
  sortOrder: "0",
  initialStock: "0",
  isActive: true,
};

function formatPercent(weight: number) {
  return (weight / 100).toFixed(2).replace(/\.?0+$/, "");
}

function probabilityWeight(value: string) {
  const trimmed = value.trim();
  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, decimal = ""] = trimmed.split(".");
  const weight = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isInteger(weight) && weight >= 0 && weight <= 10000
    ? weight
    : null;
}

function draftFromTicket(ticket: AdminTicketType | null): ProbabilityDraft {
  const config = ticket?.probability;
  return config
    ? {
        prize: formatPercent(config.prizeWeight),
        retry: formatPercent(config.retryWeight),
        thanks: formatPercent(config.missWeight),
      }
    : { prize: "60", retry: "20", thanks: "20" };
}

async function apiRequest<T extends object>(url: string, init?: RequestInit) {
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(withBasePath(url), {
    ...init,
    headers: init?.body && !isFormData
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const payload = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    throw new Error("message" in payload ? payload.message : "操作失败");
  }
  return payload as T;
}

function TicketEditor({
  form,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  form: TicketForm;
  busy: boolean;
  onChange: (form: TicketForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="admin-prize-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-ticket-title"
        onSubmit={onSubmit}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="关闭券种编辑"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
        <p className="eyebrow">TICKET DESIGN</p>
        <h2 id="admin-ticket-title">
          {form.id ? "编辑券种" : "创建新券种"}
        </h2>
        <div className="admin-form-grid">
          <label>
            券种名称
            <input
              required
              maxLength={40}
              value={form.name}
              onChange={(event) =>
                onChange({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            类型
            <select
              value={form.kind}
              onChange={(event) => {
                const kind = event.target.value as TicketForm["kind"];
                onChange({
                  ...form,
                  kind,
                  displayIcon: form.id
                    ? form.displayIcon
                    : kind === "limited"
                      ? "moon"
                      : "ticket",
                });
              }}
            >
              <option value="permanent">常驻券</option>
              <option value="limited">限定券</option>
            </select>
          </label>
          <label className="wide">
            说明
            <textarea
              value={form.description}
              onChange={(event) =>
                onChange({ ...form, description: event.target.value })
              }
            />
          </label>
          <fieldset className="ticket-icon-picker wide">
            <legend>选择券种图标</legend>
            <p>用于缩小奖券包、最近奖券和管理标签，不会改变刮奖券面。</p>
            <div className="ticket-icon-grid">
              {ticketIconOptions.map((option) => (
                <button
                  type="button"
                  key={option.key}
                  className={form.displayIcon === option.key ? "selected" : ""}
                  aria-pressed={form.displayIcon === option.key}
                  onClick={() =>
                    onChange({ ...form, displayIcon: option.key })
                  }
                >
                  <span aria-hidden="true">{option.icon}</span>
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="ticket-image-picker wide">
            <legend>选择刮奖券面</legend>
            <p>点选后只设置实际刮奖背景，并带入推荐配色，不会改变券种图标或券包封面。</p>
            <div className="ticket-image-grid">
              {ticketImageOptions.map((option) => {
                const selected = form.drawBackgroundImagePath === option.path;
                return (
                  <button
                    type="button"
                    key={option.path}
                    className={selected ? "selected" : ""}
                    aria-pressed={selected}
                    onClick={() =>
                      onChange({
                        ...form,
                        drawBackgroundImagePath: option.path,
                        themeColor: option.themeColor,
                        accentColor: option.accentColor,
                        scratchMaskColor: option.scratchMaskColor,
                        scratchTextColor: option.scratchTextColor,
                      })
                    }
                  >
                    <Image
                      src={withBasePath(option.path)}
                      alt=""
                      width={76}
                      height={76}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    <i aria-hidden="true">{selected ? "✓" : ""}</i>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <details className="ticket-image-custom wide">
            <summary>使用自定义图片路径</summary>
            <div>
              <label>
                自定义券包封面路径（可选）
                <input
                  value={form.coverImagePath}
                  placeholder="/momo/tickets/my-ticket.webp（可留空）"
                  onChange={(event) =>
                    onChange({ ...form, coverImagePath: event.target.value })
                  }
                />
              </label>
              <label>
                刮奖背景路径
                <input
                  required
                  value={form.drawBackgroundImagePath}
                  placeholder="/momo/scratch.jpg"
                  onChange={(event) =>
                    onChange({
                      ...form,
                      drawBackgroundImagePath: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          </details>
          {(
            [
              ["themeColor", "主题色"],
              ["accentColor", "强调色"],
              ["scratchMaskColor", "遮罩颜色"],
              ["scratchTextColor", "遮罩文字颜色"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <span className="admin-color-field">
                <input
                  type="color"
                  value={form[key]}
                  onChange={(event) =>
                    onChange({ ...form, [key]: event.target.value })
                  }
                />
                <code>{form[key]}</code>
              </span>
            </label>
          ))}
          <label>
            Canvas 提示语
            <input
              required
              maxLength={40}
              value={form.scratchPrompt}
              onChange={(event) =>
                onChange({ ...form, scratchPrompt: event.target.value })
              }
            />
          </label>
          <label>
            排序值
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                onChange({ ...form, sortOrder: event.target.value })
              }
            />
          </label>
          {form.id && (
            <>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={form.isGrantEnabled}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      isGrantEnabled: event.target.checked,
                    })
                  }
                />
                允许继续发放
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={form.isDrawEnabled}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      isDrawEnabled: event.target.checked,
                    })
                  }
                />
                允许已持有券刮奖
              </label>
            </>
          )}
        </div>
        <div className="admin-modal-actions">
          <button type="button" className="soft-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "正在保存…" : "保存券种"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PrizeEditor({
  form,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  form: PrizeForm;
  busy: boolean;
  onChange: (form: PrizeForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const selectedIcon = form.imageFile
    ? undefined
    : prizeIcons.find((icon) => icon.path === form.imagePath);
  const selectedCategory = prizeIconCategories.find((category) =>
    category.icons.some((icon) => icon.path === form.imagePath),
  );
  const [activeIconCategory, setActiveIconCategory] =
    useState<PrizeIconCategoryId>(selectedCategory?.id ?? "affection");
  const activeIcons =
    prizeIconCategories.find((category) => category.id === activeIconCategory)
      ?.icons ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const previewUrlRef = useRef("");

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const replacePreviewUrl = (nextUrl = "") => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  };

  const chooseIcon = (path: string) => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    replacePreviewUrl();
    setUploadError("");
    onChange({ ...form, imagePath: path, imageFile: null });
  };

  const clearImage = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    replacePreviewUrl();
    setUploadError("");
    onChange({ ...form, imagePath: "", imageFile: null });
  };

  const chooseUpload = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setUploadError("请选择 PNG、JPG/JPEG 或 WebP 图片");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("图片大小不能超过 5 MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploadError("");
    replacePreviewUrl(URL.createObjectURL(file));
    onChange({ ...form, imageFile: file });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="admin-prize-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-prize-title"
        onSubmit={onSubmit}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="关闭奖品编辑"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
        <p className="eyebrow">PRIZE</p>
        <h2 id="admin-prize-title">{form.id ? "编辑奖品" : "添加奖品"}</h2>
        <div className="admin-form-grid">
          <label>
            奖品名称
            <input
              required
              value={form.name}
              onChange={(event) =>
                onChange({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            排序值
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                onChange({ ...form, sortOrder: event.target.value })
              }
            />
          </label>
          <label className="wide">
            说明
            <textarea
              value={form.description}
              onChange={(event) =>
                onChange({ ...form, description: event.target.value })
              }
            />
          </label>
          <fieldset className="wide prize-icon-picker">
            <div className="prize-icon-picker-heading">
              <div>
                <legend>选择固定图标</legend>
                <p>没有准备图片时，可以从这里挑一个小图标。</p>
              </div>
              {(form.imagePath || form.imageFile) && (
                <button
                  type="button"
                  className="clear-prize-image"
                  onClick={clearImage}
                  disabled={busy}
                >
                  清空图片
                </button>
              )}
            </div>
            <div className="prize-icon-category-tabs" aria-label="图标分类">
              {prizeIconCategories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={
                    activeIconCategory === category.id ? "active" : ""
                  }
                  aria-pressed={activeIconCategory === category.id}
                  onClick={() => setActiveIconCategory(category.id)}
                  disabled={busy}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="prize-icon-grid">
              {activeIcons.map((icon) => (
                <button
                  type="button"
                  key={icon.id}
                  className={selectedIcon?.id === icon.id ? "selected" : ""}
                  aria-pressed={selectedIcon?.id === icon.id}
                  onClick={() => chooseIcon(icon.path)}
                  disabled={busy}
                  title={icon.label}
                >
                  <Image
                    src={withBasePath(icon.path)}
                    alt=""
                    width={54}
                    height={54}
                    unoptimized
                  />
                  <span>{icon.label}</span>
                </button>
              ))}
            </div>
            <div className="prize-icon-selection" aria-live="polite">
              {form.imageFile && previewUrl ? (
                <>
                  <Image
                    src={previewUrl}
                    alt="上传图片预览"
                    width={42}
                    height={42}
                    unoptimized
                  />
                  <span>
                    待上传图片
                    <strong>{form.imageFile.name}</strong>
                  </span>
                </>
              ) : selectedIcon ? (
                <>
                  <Image
                    src={withBasePath(selectedIcon.path)}
                    alt=""
                    width={42}
                    height={42}
                    unoptimized
                  />
                  <span>
                    当前选择
                    <strong>{selectedIcon.label}</strong>
                  </span>
                </>
              ) : form.imagePath ? (
                <>
                  <img
                    src={withBasePath(form.imagePath)}
                    alt="当前奖品图片"
                  />
                  <span>
                    当前图片
                    <strong>保存后继续保留，或上传新图片替换</strong>
                  </span>
                </>
              ) : (
                <span>
                  暂未选择，玩家端会显示默认礼物图标
                </span>
              )}
            </div>
          </fieldset>
          <div className="wide prize-image-upload">
            <div>
              <strong>上传自定义图片</strong>
              <small>支持 PNG、JPG/JPEG、WebP，单张不超过 5 MB。</small>
            </div>
            <label className="soft-button">
              选择图片
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(event) => chooseUpload(event.target.files?.[0])}
              />
            </label>
            {form.imageFile && <span>{form.imageFile.name}</span>}
            {uploadError && <p role="alert">{uploadError}</p>}
          </div>
          {!form.id && (
            <label>
              初始库存
              <input
                type="number"
                min="0"
                value={form.initialStock}
                onChange={(event) =>
                  onChange({ ...form, initialStock: event.target.value })
                }
              />
            </label>
          )}
          {form.id && (
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  onChange({ ...form, isActive: event.target.checked })
                }
              />
              启用奖品
            </label>
          )}
        </div>
        <div className="admin-modal-actions">
          <button type="button" className="soft-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "正在保存…" : "保存奖品"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminScreen({
  isSigningOut,
  onSignOut,
}: {
  isSigningOut: boolean;
  onSignOut: () => void;
}) {
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [activeSection, setActiveSection] =
    useState<AdminSection>("tickets");
  const [ticketWorkspaceTab, setTicketWorkspaceTab] =
    useState<TicketWorkspaceTab>("balance");
  const [probabilities, setProbabilities] = useState<ProbabilityDraft>({
    prize: "60",
    retry: "20",
    thanks: "20",
  });
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [ticketForm, setTicketForm] = useState<TicketForm | null>(null);
  const [prizeForm, setPrizeForm] = useState<PrizeForm | null>(null);
  const [balanceDirection, setBalanceDirection] = useState<1 | -1>(1);
  const [balanceAmount, setBalanceAmount] = useState("1");
  const [balanceNote, setBalanceNote] = useState("");
  const [poolPrizeId, setPoolPrizeId] = useState("");
  const [poolWeight, setPoolWeight] = useState("10");
  const [stockAmounts, setStockAmounts] = useState<Record<number, string>>({});
  const selectedTicketIdRef = useRef<number | null>(null);

  const selectedTicket = useMemo(
    () =>
      overview?.tickets.find((ticket) => ticket.id === selectedTicketId) ??
      null,
    [overview, selectedTicketId],
  );

  const loadOverview = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await apiRequest<AdminOverviewResponse>(
        "/api/admin/overview",
      );
      setOverview(data);
      const current = selectedTicketIdRef.current;
      const next =
        current && data.tickets.some((ticket) => ticket.id === current)
          ? current
          : (data.tickets.find((ticket) => !ticket.archivedAt)?.id ?? null);
      selectedTicketIdRef.current = next;
      setSelectedTicketId(next);
      setProbabilities(
        draftFromTicket(
          data.tickets.find((ticket) => ticket.id === next) ?? null,
        ),
      );
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "暂时无法读取管理员数据",
      );
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<AdminOverviewResponse>("/api/admin/overview")
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        const next =
          data.tickets.find((ticket) => !ticket.archivedAt)?.id ?? null;
        selectedTicketIdRef.current = next;
        setSelectedTicketId(next);
        setProbabilities(
          draftFromTicket(
            data.tickets.find((ticket) => ticket.id === next) ?? null,
          ),
        );
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "暂时无法读取管理员数据",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectAdminTicket = (ticket: AdminTicketType) => {
    selectedTicketIdRef.current = ticket.id;
    setSelectedTicketId(ticket.id);
    setProbabilities(draftFromTicket(ticket));
  };

  const runMutation = async (
    action: string,
    operation: () => Promise<AdminMutationResponse>,
  ) => {
    if (busyAction) return false;
    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      const result = await operation();
      setNotice(result.message);
      await loadOverview(false);
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "操作失败，请稍后再试",
      );
      return false;
    } finally {
      setBusyAction("");
    }
  };

  const showFeedback = (message: string, isError = false) => {
    if (isError) {
      setError(message);
      setNotice("");
    } else {
      setNotice(message);
      setError("");
    }
  };

  const submitTicket = async (event: FormEvent) => {
    event.preventDefault();
    if (!ticketForm) return;
    const editing = ticketForm.id !== null;
    const saved = await runMutation("ticket-form", () =>
      apiRequest<AdminMutationResponse>(
        editing ? `/api/admin/tickets/${ticketForm.id}` : "/api/admin/tickets",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...ticketForm,
            sortOrder: Number(ticketForm.sortOrder),
          }),
        },
      ),
    );
    if (saved) setTicketForm(null);
  };

  const editTicket = (ticket: AdminTicketType) => {
    setTicketForm({
      id: ticket.id,
      name: ticket.name,
      description: ticket.description ?? "",
      kind: ticket.kind,
      displayIcon: ticket.displayIcon,
      coverImagePath: ticket.coverImagePath ?? "",
      drawBackgroundImagePath:
        ticket.drawBackgroundImagePath ?? "/momo/scratch.jpg",
      themeColor: ticket.themeColor,
      accentColor: ticket.accentColor,
      scratchMaskColor: ticket.scratchMaskColor,
      scratchTextColor: ticket.scratchTextColor,
      scratchPrompt: ticket.scratchPrompt,
      sortOrder: String(ticket.sortOrder),
      isGrantEnabled: ticket.isGrantEnabled,
      isDrawEnabled: ticket.isDrawEnabled,
    });
  };

  const probabilityWeights = {
    prize: probabilityWeight(probabilities.prize),
    retry: probabilityWeight(probabilities.retry),
    thanks: probabilityWeight(probabilities.thanks),
  };
  const probabilityTotal =
    probabilityWeights.prize !== null &&
    probabilityWeights.retry !== null &&
    probabilityWeights.thanks !== null
      ? probabilityWeights.prize +
        probabilityWeights.retry +
        probabilityWeights.thanks
      : null;

  const saveProbability = () => {
    if (!selectedTicket || probabilityTotal !== 10000) {
      setError("三类概率最多保留两位小数，且总和必须等于 100%");
      return;
    }
    void runMutation("probability", () =>
      apiRequest<AdminMutationResponse>("/api/admin/probability", {
        method: "PUT",
        body: JSON.stringify({
          ticketTypeId: selectedTicket.id,
          prizeWeight: probabilityWeights.prize,
          retryWeight: probabilityWeights.retry,
          missWeight: probabilityWeights.thanks,
        }),
      }),
    );
  };

  const adjustBalance = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTicket) return;
    const amount = Number(balanceAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("请输入大于 0 的整数张数");
      return;
    }
    if (balanceDirection > 0 && !balanceNote.trim()) {
      setError("发放幸运券时请填写玩家可见的原因");
      return;
    }
    void runMutation("balance", () =>
      apiRequest<AdminMutationResponse>("/api/admin/balance", {
        method: "PATCH",
        body: JSON.stringify({
          ticketTypeId: selectedTicket.id,
          delta: balanceDirection * amount,
          note: balanceNote.trim(),
        }),
      }),
    ).then((saved) => {
      if (saved) {
        setBalanceAmount("1");
        setBalanceNote("");
      }
    });
  };

  const addRetryOption = () => {
    if (!selectedTicket) return;
    void runMutation("retry-new", () =>
      apiRequest<AdminMutationResponse>("/api/admin/retry-options", {
        method: "POST",
        body: JSON.stringify({
          ticketTypeId: selectedTicket.id,
          extraCount: 1,
          weight: 10,
        }),
      }),
    );
  };

  const updateRetryDraft = (
    id: number,
    field: "extraCount" | "weight" | "isActive",
    value: number | boolean,
  ) => {
    setOverview((current) =>
      current
        ? {
            ...current,
            tickets: current.tickets.map((ticket) => ({
              ...ticket,
              retryOptions: ticket.retryOptions.map((option) =>
                option.id === id ? { ...option, [field]: value } : option,
              ),
            })),
          }
        : current,
    );
  };

  const saveRetry = (id: number) => {
    const option = selectedTicket?.retryOptions.find((item) => item.id === id);
    if (!option) return;
    void runMutation(`retry-${id}`, () =>
      apiRequest<AdminMutationResponse>(`/api/admin/retry-options/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          extraCount: option.extraCount,
          weight: option.weight,
          isActive: option.isActive,
        }),
      }),
    );
  };

  const addPoolItem = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTicket) return;
    void runMutation("pool-new", () =>
      apiRequest<AdminMutationResponse>("/api/admin/ticket-pool", {
        method: "POST",
        body: JSON.stringify({
          ticketTypeId: selectedTicket.id,
          prizeId: Number(poolPrizeId),
          weight: Number(poolWeight),
        }),
      }),
    ).then((saved) => {
      if (saved) setPoolPrizeId("");
    });
  };

  const updatePoolDraft = (
    id: number,
    field: "weight" | "isActive",
    value: number | boolean,
  ) => {
    setOverview((current) =>
      current
        ? {
            ...current,
            tickets: current.tickets.map((ticket) => ({
              ...ticket,
              poolItems: ticket.poolItems.map((item) =>
                item.id === id ? { ...item, [field]: value } : item,
              ),
            })),
          }
        : current,
    );
  };

  const savePoolItem = (id: number) => {
    const item = selectedTicket?.poolItems.find((entry) => entry.id === id);
    if (!item) return;
    void runMutation(`pool-${id}`, () =>
      apiRequest<AdminMutationResponse>(`/api/admin/ticket-pool/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          weight: item.weight,
          isActive: item.isActive,
        }),
      }),
    );
  };

  const submitPrize = async (event: FormEvent) => {
    event.preventDefault();
    if (!prizeForm) return;
    const editing = prizeForm.id !== null;
    const saved = await runMutation("prize-form", async () => {
      let imagePath = prizeForm.imagePath;
      if (prizeForm.imageFile) {
        const uploadBody = new FormData();
        uploadBody.append("image", prizeForm.imageFile);
        const upload = await apiRequest<PrizeImageUploadResponse>(
          "/api/admin/prize-images",
          { method: "POST", body: uploadBody },
        );
        imagePath = upload.imagePath;
      }

      return apiRequest<AdminMutationResponse>(
        editing ? `/api/admin/prizes/${prizeForm.id}` : "/api/admin/prizes",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            name: prizeForm.name,
            description: prizeForm.description,
            imagePath,
            sortOrder: Number(prizeForm.sortOrder),
            ...(editing
              ? { isActive: prizeForm.isActive }
              : { initialStock: Number(prizeForm.initialStock) }),
          }),
        },
      );
    });
    if (saved) setPrizeForm(null);
  };

  const editPrize = (prize: AdminPrize) => {
    setPrizeForm({
      id: prize.id,
      name: prize.name,
      description: prize.description ?? "",
      imagePath: prize.imagePath ?? "",
      imageFile: null,
      sortOrder: String(prize.sortOrder),
      initialStock: "0",
      isActive: prize.isActive,
    });
  };

  const adjustStock = (prize: AdminPrize, direction: 1 | -1) => {
    const amount = Number(stockAmounts[prize.id] ?? "1");
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("库存调整量必须是大于 0 的整数");
      return;
    }
    void runMutation(`stock-${prize.id}`, () =>
      apiRequest<AdminMutationResponse>(`/api/admin/prizes/${prize.id}/stock`, {
        method: "POST",
        body: JSON.stringify({ delta: direction * amount }),
      }),
    );
  };

  if (isLoading) {
    return (
      <main className="app-shell admin-screen admin-state-screen">
        <div>
          <span>🐿️</span>
          <h1>飞鼠正在清点小仓库…</h1>
        </div>
      </main>
    );
  }

  if (!overview) {
    return (
      <main className="app-shell admin-screen admin-state-screen">
        <div>
          <span>🌧️</span>
          <h1>暂时没能打开小仓库</h1>
          <p>{error}</p>
          <button className="primary-button" onClick={() => void loadOverview()}>
            重新读取
          </button>
        </div>
      </main>
    );
  }

  const availablePoolPrizes = overview.prizes.filter(
    (prize) =>
      !prize.archivedAt &&
      !selectedTicket?.poolItems.some(
        (item) => item.prizeId === prize.id && !item.archivedAt,
      ),
  );

  return (
    <main className="app-shell admin-screen">
      <nav className="topbar admin-topbar">
        <div className="brand">
          <span>✦</span> 飞鼠的小仓库
        </div>
        <button
          className="collection-link"
          onClick={onSignOut}
          disabled={isSigningOut || Boolean(busyAction)}
        >
          {isSigningOut ? "正在返回…" : "← 返回主页"}
        </button>
      </nav>

      {(notice || error) && (
        <div
          className={`admin-feedback ${error ? "error" : "success"}`}
          role="status"
        >
          {error || notice}
        </div>
      )}

      <div className="admin-main-tabs" role="tablist">
        {(
          [
            ["tickets", "券种管理"],
            ["prizes", "奖品仓库"],
            ["redemptions", "兑换处理"],
            ["history", "历史记录"],
          ] as Array<[AdminSection, string]>
        ).map(([section, label]) => (
          <button
            key={section}
            className={activeSection === section ? "active" : ""}
            onClick={() => setActiveSection(section)}
            role="tab"
            aria-selected={activeSection === section}
          >
            {label}
          </button>
        ))}
      </div>

      {(activeSection === "tickets" ||
        activeSection === "prizes") && (
        <>
          {activeSection === "tickets" && (
            <section className="admin-stats">
            <article>
              <span>🎟️</span>
              <div>
                <small>玩家持有奖券</small>
                <strong>{overview.totalTickets}</strong>
              </div>
            </article>
            <article>
              <span>🎁</span>
              <div>
                <small>奖品总库存</small>
                <strong>{overview.totalStock}</strong>
              </div>
            </article>
            <article>
              <span>💝</span>
              <div>
                <small>已送出礼物</small>
                <strong>{overview.deliveredCount}</strong>
              </div>
            </article>
            </section>
          )}

          {activeSection === "tickets" && (
            <div className="admin-ticket-workspace">
              <section className="admin-content ticket-type-panel">
            <div className="section-title">
              <div>
                <p className="eyebrow">TICKET TYPES</p>
                <h2>选择要配置的奖券</h2>
              </div>
              <button
                className="soft-button"
                onClick={() => setTicketForm({ ...emptyTicketForm })}
              >
                ＋ 创建券种
              </button>
            </div>
            <label className="admin-ticket-mobile-picker">
              当前券种
              <select
                value={selectedTicketId ?? ""}
                onChange={(event) => {
                  const ticket = overview.tickets.find(
                    (item) => item.id === Number(event.target.value),
                  );
                  if (ticket) selectAdminTicket(ticket);
                }}
              >
                {overview.tickets.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>
                    {ticket.name} · {ticket.balance} 张
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-ticket-tabs">
              {overview.tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  className={selectedTicketId === ticket.id ? "active" : ""}
                  style={{
                    borderColor: ticket.themeColor,
                    background:
                      selectedTicketId === ticket.id
                        ? ticket.themeColor
                        : undefined,
                  }}
                  onClick={() => selectAdminTicket(ticket)}
                >
                  <span>{ticketIcon(ticket.displayIcon)}</span>
                  <b>{ticket.name}</b>
                  <small>
                    {ticket.balance} 张 · {ticket.isDrawEnabled ? "可刮" : "停刮"}
                  </small>
                  <i>
                    {ticket.archivedAt
                      ? "已归档"
                      : ticket.isGrantEnabled
                        ? "可发放"
                        : "停发放"}
                  </i>
                </button>
              ))}
            </div>
              </section>

          {selectedTicket ? (
            <>
              <section className="admin-content selected-ticket-summary">
                <div
                  className="admin-ticket-preview"
                  style={{
                    background: `linear-gradient(135deg, ${selectedTicket.themeColor}, ${selectedTicket.accentColor})`,
                  }}
                >
                  {selectedTicket.coverImagePath ? (
                    <img
                      src={withBasePath(selectedTicket.coverImagePath)}
                      alt=""
                    />
                  ) : (
                    <span>{ticketIcon(selectedTicket.displayIcon)}</span>
                  )}
                  <div>
                    <small className="ticket-summary-meta">
                      <span>
                        {selectedTicket.kind === "limited" ? "限定券" : "常驻券"}
                      </span>
                      <span>
                        {selectedTicket.isGrantEnabled ? "可发放" : "已停发"}
                      </span>
                      <span>
                        {selectedTicket.isDrawEnabled ? "可刮奖" : "已停刮"}
                      </span>
                    </small>
                    <strong>{selectedTicket.name}</strong>
                    <p>{selectedTicket.description}</p>
                  </div>
                  <b>× {selectedTicket.balance}</b>
                </div>
                <div className="selected-ticket-actions">
                  <button
                    className="soft-button"
                    onClick={() => editTicket(selectedTicket)}
                  >
                    编辑外观与状态
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `确定归档“${selectedTicket.name}”吗？`,
                        )
                      ) {
                        void runMutation("ticket-archive", () =>
                          apiRequest<AdminMutationResponse>(
                            `/api/admin/tickets/${selectedTicket.id}`,
                            { method: "DELETE" },
                          ),
                        );
                      }
                    }}
                  >
                    归档券种
                  </button>
                </div>
              </section>

              <div className="admin-ticket-subnav" role="tablist">
                {(
                  [
                    ["balance", "券与余额"],
                    ["pool", "概率与奖池"],
                    ["retry", "再来配置"],
                  ] as Array<[TicketWorkspaceTab, string]>
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    className={ticketWorkspaceTab === tab ? "active" : ""}
                    onClick={() => setTicketWorkspaceTab(tab)}
                    role="tab"
                    aria-selected={ticketWorkspaceTab === tab}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {ticketWorkspaceTab === "balance" && (
                <section className="admin-content ticket-workspace-panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">GRANT TICKETS</p>
                    <h2>发放或扣减“{selectedTicket.name}”</h2>
                  </div>
                </div>
                <form className="ticket-grant-form" onSubmit={adjustBalance}>
                  <select
                    value={balanceDirection}
                    onChange={(event) =>
                      setBalanceDirection(
                        Number(event.target.value) as 1 | -1,
                      )
                    }
                  >
                    <option value={1}>发放</option>
                    <option value={-1}>扣减</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={balanceAmount}
                    onChange={(event) => setBalanceAmount(event.target.value)}
                  />
                  <input
                    value={balanceNote}
                    placeholder={
                      balanceDirection > 0
                        ? "给她看到的奖励原因（必填）"
                        : "管理员备注（可选）"
                    }
                    onChange={(event) => setBalanceNote(event.target.value)}
                  />
                  <button
                    className="primary-button"
                    disabled={busyAction === "balance"}
                  >
                    确认调整
                  </button>
                </form>
                </section>
              )}

              {ticketWorkspaceTab === "pool" && (
                <>
                  <section className="admin-content probability-panel ticket-workspace-panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">DRAW PROBABILITY</p>
                    <h2>“{selectedTicket.name}”概率</h2>
                  </div>
                  <span
                    className={`probability-total ${probabilityTotal === 10000 ? "valid" : ""}`}
                  >
                    合计{" "}
                    {probabilityTotal === null
                      ? "无效"
                      : `${formatPercent(probabilityTotal)}%`}
                  </span>
                </div>
                <div className="probability-grid">
                  {(Object.keys(resultMeta) as ResultKind[]).map((kind) => (
                    <label
                      className={`probability-card ${resultMeta[kind].color}`}
                      key={kind}
                    >
                      <span>{resultMeta[kind].icon}</span>
                      <b>{resultMeta[kind].label}</b>
                      <div>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={probabilities[kind]}
                          onChange={(event) =>
                            setProbabilities((current) => ({
                              ...current,
                              [kind]: event.target.value,
                            }))
                          }
                        />
                        <i>%</i>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="probability-note">
                  每个券种独立保存概率版本。奖品权重在下方券池单独配置。
                  {selectedTicket.probability
                    ? ` 当前启用第 ${selectedTicket.probability.version} 版。`
                    : " 当前还没有启用的概率配置。"}
                </div>
                <button
                  className="primary-button save-probability"
                  disabled={
                    probabilityTotal !== 10000 ||
                    busyAction === "probability"
                  }
                  onClick={saveProbability}
                >
                  保存概率设置
                </button>
                  </section>

                  <section className="admin-content ticket-workspace-panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">PRIZE POOL</p>
                    <h2>“{selectedTicket.name}”奖品池</h2>
                  </div>
                </div>
                <form className="pool-add-form" onSubmit={addPoolItem}>
                  <select
                    required
                    value={poolPrizeId}
                    onChange={(event) => setPoolPrizeId(event.target.value)}
                  >
                    <option value="">选择仓库中的奖品</option>
                    {availablePoolPrizes.map((prize) => (
                      <option key={prize.id} value={prize.id}>
                        {prize.name}（库存 {prize.remainingStock}）
                      </option>
                    ))}
                  </select>
                  <label>
                    权重
                    <input
                      type="number"
                      min="1"
                      value={poolWeight}
                      onChange={(event) => setPoolWeight(event.target.value)}
                    />
                  </label>
                  <button className="soft-button">加入奖池</button>
                </form>
                <div className="pool-readiness" role="status">
                  <span>
                    <b>
                      {
                        selectedTicket.poolItems.filter(
                          (item) =>
                            !item.archivedAt &&
                            item.isActive &&
                            item.prizeActive &&
                            item.prizeStock > 0,
                        ).length
                      }
                    </b>
                    个奖品当前可抽
                  </span>
                  <span>
                    奖品概率 {probabilities.prize || "0"}%
                  </span>
                </div>
                <div className="retry-list pool-list">
                  {selectedTicket.poolItems.map((item) => (
                    <article
                      key={item.id}
                      className={item.archivedAt ? "archived" : ""}
                    >
                      <span className="retry-ticket">🎁</span>
                      <strong>{item.prizeName}</strong>
                      <small>库存 {item.prizeStock}</small>
                      {!item.archivedAt && (
                        <>
                          <label>
                            权重
                            <input
                              type="number"
                              min="1"
                              value={item.weight}
                              onChange={(event) =>
                                updatePoolDraft(
                                  item.id,
                                  "weight",
                                  Number(event.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="row-checkbox">
                            <input
                              type="checkbox"
                              checked={item.isActive}
                              onChange={(event) =>
                                updatePoolDraft(
                                  item.id,
                                  "isActive",
                                  event.target.checked,
                                )
                              }
                            />
                            启用
                          </label>
                          <button
                            className="row-save"
                            onClick={() => savePoolItem(item.id)}
                          >
                            保存
                          </button>
                          <button
                            aria-label="移出奖池"
                            onClick={() =>
                              void runMutation(`pool-${item.id}`, () =>
                                apiRequest<AdminMutationResponse>(
                                  `/api/admin/ticket-pool/${item.id}`,
                                  { method: "DELETE" },
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </>
                      )}
                    </article>
                  ))}
                  {selectedTicket.poolItems.length === 0 && (
                    <div className="admin-empty">
                      这个券池还没有奖品，请从奖品仓库中添加。
                    </div>
                  )}
                </div>
                  </section>
                </>
              )}

              {ticketWorkspaceTab === "retry" && (
                <section className="admin-content ticket-workspace-panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">TRY AGAIN POOL</p>
                    <h2>“再来 x 张同类券”</h2>
                  </div>
                  <button className="soft-button" onClick={addRetryOption}>
                    ＋ 添加条目
                  </button>
                </div>
                <div className="retry-list">
                  {selectedTicket.retryOptions.map((option) => (
                    <article
                      key={option.id}
                      className={option.archivedAt ? "archived" : ""}
                    >
                      <span className="retry-ticket">🎟️</span>
                      <label>
                        再来
                        <input
                          type="number"
                          min="1"
                          value={option.extraCount}
                          disabled={Boolean(option.archivedAt)}
                          onChange={(event) =>
                            updateRetryDraft(
                              option.id,
                              "extraCount",
                              Number(event.target.value),
                            )
                          }
                        />
                        张
                      </label>
                      <label>
                        权重
                        <input
                          type="number"
                          min="1"
                          value={option.weight}
                          disabled={Boolean(option.archivedAt)}
                          onChange={(event) =>
                            updateRetryDraft(
                              option.id,
                              "weight",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                      {!option.archivedAt && (
                        <>
                          <label className="row-checkbox">
                            <input
                              type="checkbox"
                              checked={option.isActive}
                              onChange={(event) =>
                                updateRetryDraft(
                                  option.id,
                                  "isActive",
                                  event.target.checked,
                                )
                              }
                            />
                            启用
                          </label>
                          <button
                            className="row-save"
                            onClick={() => saveRetry(option.id)}
                          >
                            保存
                          </button>
                          <button
                            aria-label="归档条目"
                            onClick={() =>
                              void runMutation(`retry-${option.id}`, () =>
                                apiRequest<AdminMutationResponse>(
                                  `/api/admin/retry-options/${option.id}`,
                                  { method: "DELETE" },
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </>
                      )}
                    </article>
                  ))}
                </div>
                </section>
              )}
            </>
          ) : (
            <section className="admin-content admin-empty">
              请先创建一个券种。
            </section>
          )}
            </div>
          )}

          {activeSection === "prizes" && (
            <section className="admin-content admin-prize-warehouse">
            <div className="section-title">
              <div>
                <p className="eyebrow">GLOBAL PRIZES</p>
                <h2>共享奖品仓库</h2>
              </div>
              <button
                className="soft-button"
                onClick={() => setPrizeForm({ ...emptyPrizeForm })}
              >
                ＋ 添加奖品
              </button>
            </div>
            <div className="admin-prizes">
              {overview.prizes.map((prize) => (
                <article
                  key={prize.id}
                  className={prize.archivedAt ? "archived" : ""}
                >
                  <span className="prize-icon pink">🎁</span>
                  <div className="admin-prize-copy">
                    <h3>{prize.name}</h3>
                    <p>{prize.description || "还没有填写奖品说明"}</p>
                    <small>
                      {prize.archivedAt
                        ? "已归档"
                        : prize.isActive
                          ? "已启用"
                          : "已停用"}
                    </small>
                  </div>
                  <div className="stock">
                    <small>共享库存</small>
                    <strong>{prize.remainingStock}</strong>
                  </div>
                  {!prize.archivedAt && (
                    <>
                      <div className="stock-adjuster">
                        <input
                          type="number"
                          min="1"
                          value={stockAmounts[prize.id] ?? "1"}
                          onChange={(event) =>
                            setStockAmounts((current) => ({
                              ...current,
                              [prize.id]: event.target.value,
                            }))
                          }
                        />
                        <button onClick={() => adjustStock(prize, -1)}>
                          −
                        </button>
                        <button onClick={() => adjustStock(prize, 1)}>
                          ＋
                        </button>
                      </div>
                      <div className="prize-row-actions">
                        <button onClick={() => editPrize(prize)}>编辑</button>
                        <button
                          className="danger"
                          onClick={() => {
                            if (
                              window.confirm(`确定归档“${prize.name}”吗？`)
                            ) {
                              void runMutation(`prize-${prize.id}`, () =>
                                apiRequest<AdminMutationResponse>(
                                  `/api/admin/prizes/${prize.id}`,
                                  { method: "DELETE" },
                                ),
                              );
                            }
                          }}
                        >
                          归档
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
            </section>
          )}
        </>
      )}

      {activeSection === "redemptions" && (
        <AdminRedemptions
          onFeedback={showFeedback}
          prizes={overview.prizes}
        />
      )}
      {activeSection === "history" && (
        <AdminHistory onFeedback={showFeedback} />
      )}

      {ticketForm && (
        <TicketEditor
          form={ticketForm}
          busy={busyAction === "ticket-form"}
          onChange={setTicketForm}
          onClose={() => setTicketForm(null)}
          onSubmit={(event) => void submitTicket(event)}
        />
      )}
      {prizeForm && (
        <PrizeEditor
          form={prizeForm}
          busy={busyAction === "prize-form"}
          onChange={setPrizeForm}
          onClose={() => setPrizeForm(null)}
          onSubmit={(event) => void submitPrize(event)}
        />
      )}
    </main>
  );
}
