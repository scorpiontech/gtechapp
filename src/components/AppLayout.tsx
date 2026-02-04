import React from 'react';
import { cn } from '@/lib/utils';
import { MobileHeader } from './MobileHeader';
import { BottomNav } from './BottomNav';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  showNav?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title,
  showBack = false,
  showNav = true,
}) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MobileHeader title={title} showBack={showBack} />
      
      <main className={cn(
        "flex-1 overflow-y-auto",
        showNav && "pb-20"
      )}>
        {children}
      </main>
      
      {showNav && <BottomNav />}
    </div>
  );
};
