import { createContext, useContext } from 'react';

export interface ModelContextType {
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
}

export const ModelContext = createContext<ModelContextType | undefined>(undefined);

export const useModel = () => {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModel must be used within a ModelProvider');
  }
  return context;
};
