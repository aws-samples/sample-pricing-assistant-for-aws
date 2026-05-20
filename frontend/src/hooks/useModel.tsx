import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ModelContextType {
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

interface ModelProviderProps {
  children: ReactNode;
}

export const ModelProvider: React.FC<ModelProviderProps> = ({ children }) => {
  const [selectedModel, setSelectedModel] = useState('us.anthropic.claude-opus-4-6-v1');

  return (
    <ModelContext.Provider value={{ selectedModel, setSelectedModel }}>
      {children}
    </ModelContext.Provider>
  );
};

export const useModel = () => {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModel must be used within a ModelProvider');
  }
  return context;
};
