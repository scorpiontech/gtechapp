import React from 'react';
import { Input } from '@/components/ui/input';

interface CPFInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const CPFInput: React.FC<CPFInputProps> = ({
  value,
  onChange,
  placeholder = '000.000.000-00',
  disabled = false,
  className,
}) => {
  const formatCPF = (input: string): string => {
    const digits = input.replace(/\D/g, '').slice(0, 11);
    
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPF(e.target.value);
    onChange(formatted);
  };

  return (
    <Input
      type="tel"
      inputMode="numeric"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      maxLength={14}
    />
  );
};
