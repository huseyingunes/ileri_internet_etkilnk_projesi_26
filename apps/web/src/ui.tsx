import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

/*
 * Shared UI primitives built on native HTML and design tokens only
 * (design-system/etkinlik-platformu/MASTER.md): visible labels, errors next to
 * the field, 44px touch targets, transform/opacity-only motion.
 */

const base =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-sm rounded-lg px-md font-semibold transition-opacity duration-150 hover:opacity-90 active:opacity-75 disabled:cursor-not-allowed disabled:opacity-60';

const variants = {
  primary: 'bg-primary text-on-primary',
  accent: 'bg-accent text-on-accent',
  secondary: 'border border-input-border bg-card text-foreground',
  danger: 'bg-destructive text-on-destructive',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}

export const buttonClass = (variant: keyof typeof variants = 'primary') =>
  `${base} ${variants[variant]}`;

interface FieldShell {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

function useFieldIds(error: string | undefined, hint: string | undefined) {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return { id, hintId, errorId, describedBy };
}

function FieldFrame({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  children,
}: FieldShell & {
  id: string;
  hintId?: string | undefined;
  errorId?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={id} className="font-semibold text-foreground">
        {label}
      </label>
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
      {error !== undefined && (
        <p id={errorId} className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  'min-h-11 w-full rounded-lg border border-input-border bg-card px-md py-sm text-base text-foreground aria-[invalid=true]:border-destructive';

export function TextField({
  label,
  hint,
  error,
  ...input
}: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(error, hint);
  return (
    <FieldFrame
      id={ids.id}
      label={label}
      hint={hint}
      hintId={ids.hintId}
      error={error}
      errorId={ids.errorId}
    >
      <input
        id={ids.id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={ids.describedBy}
        className={control}
        {...input}
      />
    </FieldFrame>
  );
}

export function TextArea({
  label,
  hint,
  error,
  ...input
}: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useFieldIds(error, hint);
  return (
    <FieldFrame
      id={ids.id}
      label={label}
      hint={hint}
      hintId={ids.hintId}
      error={error}
      errorId={ids.errorId}
    >
      <textarea
        id={ids.id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={ids.describedBy}
        className={`${control} min-h-28`}
        {...input}
      />
    </FieldFrame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...input
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const ids = useFieldIds(error, hint);
  return (
    <FieldFrame
      id={ids.id}
      label={label}
      hint={hint}
      hintId={ids.hintId}
      error={error}
      errorId={ids.errorId}
    >
      <select
        id={ids.id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={ids.describedBy}
        className={control}
        {...input}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-border bg-card p-lg text-card-foreground ${className}`}
    >
      {children}
    </section>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-sm py-xs text-sm font-semibold text-foreground">
      {children}
    </span>
  );
}

export function PageTitle({
  children,
  description,
}: {
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-lg">
      <h1 className="text-3xl font-bold text-foreground">{children}</h1>
      {description !== undefined && (
        <p className="mt-sm max-w-prose text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function StatusMessage({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'error';
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}
    >
      {children}
    </p>
  );
}

interface PictureSource {
  url: string;
  format: 'avif' | 'webp' | 'jpeg';
  width: number;
  height: number;
}

/**
 * Responsive image with AVIF/WebP `srcset`, explicit size (no layout shift) and
 * lazy loading except for above-the-fold images.
 */
export function Picture({
  variants,
  alt,
  width,
  height,
  sizes,
  eager = false,
  className = '',
}: {
  variants: PictureSource[];
  alt: string;
  width: number;
  height: number;
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  const srcset = (format: PictureSource['format']) =>
    variants
      .filter((v) => v.format === format)
      .map((v) => `${v.url} ${v.width.toString()}w`)
      .join(', ');
  const fallback = variants.find((v) => v.format === 'webp') ?? variants[0];
  if (fallback === undefined) return null;
  return (
    <picture>
      <source type="image/avif" srcSet={srcset('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcset('webp')} sizes={sizes} />
      <img
        src={fallback.url}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        {...(eager ? { fetchPriority: 'high' as const } : {})}
        className={`h-auto w-full rounded-lg object-cover ${className}`}
      />
    </picture>
  );
}
