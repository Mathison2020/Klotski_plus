import { CaretDownIcon } from '@phosphor-icons/react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  OptionHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline';
  size?: 'default' | 'xs' | 'sm' | 'icon-sm';
};

export function Button({
  variant = 'default',
  size = 'default',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  const variantClass =
    variant === 'outline'
      ? 'border-border bg-background hover:bg-muted hover:text-foreground'
      : 'bg-primary text-primary-foreground hover:bg-primary/80';
  const sizeClass =
    size === 'icon-sm'
      ? 'size-7 p-0'
      : size === 'xs'
        ? 'h-6 gap-1 px-2 text-xs'
        : size === 'sm'
          ? 'h-7 gap-1 px-2.5 text-[0.8rem]'
          : 'h-8 gap-1.5 px-2.5 text-sm';
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${variantClass} ${sizeClass} ${className}`}
      {...props}
    />
  );
}

export function NativeSelect({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative w-fit ${className}`}>
      <select
        className="h-8 min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        {...props}
      />
      <CaretDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export function NativeSelectOption(props: OptionHTMLAttributes<HTMLOptionElement>) {
  return <option className="bg-[Canvas] text-[CanvasText]" {...props} />;
}

interface SliderProps {
  value: readonly number[];
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onValueChange: (value: number[]) => void;
}

export function Slider({ value, min, max, onValueChange, ...props }: SliderProps) {
  const progress = max === min ? 0 : ((value[0] - min) / (max - min)) * 100;
  const style: CSSProperties & { '--slider-progress': string } = {
    '--slider-progress': `${progress}%`,
  };
  return (
    <input
      type="range"
      aria-label="演示进度"
      className="klotski-slider w-full cursor-pointer disabled:cursor-default disabled:opacity-50"
      value={value[0]}
      min={min}
      max={max}
      style={style}
      onChange={(event) => onValueChange([Number(event.currentTarget.value)])}
      {...props}
    />
  );
}
