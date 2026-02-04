import React from 'react';
import { Input } from '@/components/ui/input';

interface CPFCNPJInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const CPFInput: React.FC<CPFCNPJInputProps> = ({
  value,
  onChange,
  placeholder = 'CPF ou CNPJ',
  disabled = false,
  className,
}) => {
  const formatCPFCNPJ = (input: string): string => {
    const digits = input.replace(/\D/g, '');
    
    // CNPJ: 14 dígitos - XX.XXX.XXX/XXXX-XX
    if (digits.length > 11) {
      const cnpjDigits = digits.slice(0, 14);
      if (cnpjDigits.length <= 2) return cnpjDigits;
      if (cnpjDigits.length <= 5) return `${cnpjDigits.slice(0, 2)}.${cnpjDigits.slice(2)}`;
      if (cnpjDigits.length <= 8) return `${cnpjDigits.slice(0, 2)}.${cnpjDigits.slice(2, 5)}.${cnpjDigits.slice(5)}`;
      if (cnpjDigits.length <= 12) return `${cnpjDigits.slice(0, 2)}.${cnpjDigits.slice(2, 5)}.${cnpjDigits.slice(5, 8)}/${cnpjDigits.slice(8)}`;
      return `${cnpjDigits.slice(0, 2)}.${cnpjDigits.slice(2, 5)}.${cnpjDigits.slice(5, 8)}/${cnpjDigits.slice(8, 12)}-${cnpjDigits.slice(12)}`;
    }
    
    // CPF: 11 dígitos - XXX.XXX.XXX-XX
    const cpfDigits = digits.slice(0, 11);
    if (cpfDigits.length <= 3) return cpfDigits;
    if (cpfDigits.length <= 6) return `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3)}`;
    if (cpfDigits.length <= 9) return `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6)}`;
    return `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPFCNPJ(e.target.value);
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
      maxLength={18}
    />
  );
};
