import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
}

const AVAILABLE_MODELS = [
  {
    id: 'us.anthropic.claude-opus-4-6-v1',
    name: 'Claude Opus 4.6',
    description: 'Most capable model with advanced reasoning'
  },
  {
    id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    name: 'Claude Sonnet 4.5',
    description: 'Fast model with strong capabilities'
  }
];

const ModelSelector: React.FC<ModelSelectorProps> = ({ 
  selectedModel, 
  onModelChange, 
  disabled = false 
}) => {
  const { theme } = useTheme();

  const getThemeClasses = () => {
    if (theme === 'dark') {
      return {
        text: {
          primary: 'text-dark-text-primary',
          secondary: 'text-dark-text-secondary',
          muted: 'text-dark-text-muted',
        },
        bg: {
          surface: 'bg-dark-surface-primary',
          hover: 'hover:bg-dark-card',
        },
        border: 'border-dark-border',
      };
    } else {
      return {
        text: {
          primary: 'text-light-text-primary',
          secondary: 'text-light-text-secondary',
          muted: 'text-light-text-muted',
        },
        bg: {
          surface: 'bg-light-surface-primary',
          hover: 'hover:bg-light-card',
        },
        border: 'border-light-border',
      };
    }
  };

  const classes = getThemeClasses();
  const selectedModelInfo = AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];

  return (
    <div className="relative">
      <select
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={disabled}
        className={`
          appearance-none px-2 sm:px-3 py-2 pr-6 sm:pr-8 text-xs sm:text-sm rounded-lg border transition-colors duration-200
          focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none
          ${classes.bg.surface} ${classes.border} ${classes.text.primary}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        title="Select AI model"
      >
        {AVAILABLE_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
      
      {/* Custom dropdown arrow */}
      <ChevronDown 
        className={`absolute right-1 sm:right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 pointer-events-none ${classes.text.muted}`} 
      />
      
      {/* Model description tooltip positioned to the left - hidden on mobile */}
      <div className={`hidden lg:block absolute right-full mr-2 top-1/2 transform -translate-y-1/2 text-xs ${classes.text.muted} whitespace-nowrap`}>
        {selectedModelInfo.description}
      </div>
    </div>
  );
};

export default ModelSelector;
