import React from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import gtechLogo from '@/assets/gtech-logo.png';

interface MobileHeaderProps {
  title?: string;
  showBack?: boolean;
  showLogout?: boolean;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  showBack = false,
  showLogout = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isAuthenticated } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isLoginPage = location.pathname === '/';

  return (
    <header className="sticky top-0 z-50 w-full bg-card border-b border-border safe-area-inset-top">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          
          {!showBack && (
            <img 
              src={gtechLogo} 
              alt="GTech" 
              className="h-8 w-auto"
            />
          )}
          
          {title && (
            <h1 className="text-lg font-semibold truncate">
              {title}
            </h1>
          )}
        </div>

        {showLogout && isAuthenticated && !isLoginPage && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        )}
      </div>
    </header>
  );
};
