import React from 'react';
import { DollarSign, Clock, MapPin, Server } from 'lucide-react';

interface PricingDisplayProps {
  pricing: any; // Will be properly typed later when we integrate with backend
}

const PricingDisplay: React.FC<PricingDisplayProps> = ({ pricing }) => {
  if (!pricing) return null;

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  return (
    <div className="bg-dark-surface border border-dark-border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center space-x-2">
        <DollarSign className="w-5 h-5 text-green-500" />
        <h3 className="text-lg font-semibold text-dark-text-primary">
          Pricing Information
        </h3>
      </div>

      {/* Service Info */}
      {pricing.service && (
        <div className="flex items-center space-x-4 text-sm text-dark-text-secondary">
          {pricing.service && (
            <div className="flex items-center space-x-1">
              <Server className="w-4 h-4" />
              <span>{pricing.service}</span>
            </div>
          )}
          {pricing.region && (
            <div className="flex items-center space-x-1">
              <MapPin className="w-4 h-4" />
              <span>{pricing.region}</span>
            </div>
          )}
          {pricing.instanceType && (
            <div className="flex items-center space-x-1">
              <span className="font-mono text-xs bg-dark-card px-2 py-1 rounded">
                {pricing.instanceType}
              </span>
            </div>
          )}
        </div>
      )}

      {/* On-Demand Pricing */}
      {pricing.onDemand && (
        <div className="space-y-2">
          <h4 className="font-medium text-dark-text-primary">On-Demand Pricing</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pricing.onDemand.hourly && (
              <div className="bg-dark-card p-3 rounded-lg">
                <div className="flex items-center space-x-1 text-sm text-dark-text-muted mb-1">
                  <Clock className="w-4 h-4" />
                  <span>Hourly</span>
                </div>
                <div className="text-lg font-semibold text-green-500">
                  {formatCurrency(pricing.onDemand.hourly)}
                </div>
              </div>
            )}
            {pricing.onDemand.monthly && (
              <div className="bg-dark-card p-3 rounded-lg">
                <div className="text-sm text-dark-text-muted mb-1">Monthly</div>
                <div className="text-lg font-semibold text-green-500">
                  {formatCurrency(pricing.onDemand.monthly)}
                </div>
              </div>
            )}
            {pricing.onDemand.yearly && (
              <div className="bg-dark-card p-3 rounded-lg">
                <div className="text-sm text-dark-text-muted mb-1">Yearly</div>
                <div className="text-lg font-semibold text-green-500">
                  {formatCurrency(pricing.onDemand.yearly)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reserved Instance Pricing */}
      {pricing.reserved && (
        <div className="space-y-2">
          <h4 className="font-medium text-dark-text-primary">Reserved Instance Pricing</h4>
          <div className="space-y-2">
            {pricing.reserved['1year'] && (
              <div className="bg-dark-card p-3 rounded-lg">
                <div className="text-sm text-dark-text-muted mb-2">1 Year Term</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {pricing.reserved['1year'].noUpfront && (
                    <div>
                      <div className="text-dark-text-muted">No Upfront</div>
                      <div className="font-semibold text-blue-400">
                        {formatCurrency(pricing.reserved['1year'].noUpfront)}/hr
                      </div>
                    </div>
                  )}
                  {pricing.reserved['1year'].partialUpfront && (
                    <div>
                      <div className="text-dark-text-muted">Partial Upfront</div>
                      <div className="font-semibold text-blue-400">
                        {formatCurrency(pricing.reserved['1year'].partialUpfront)}/hr
                      </div>
                    </div>
                  )}
                  {pricing.reserved['1year'].allUpfront && (
                    <div>
                      <div className="text-dark-text-muted">All Upfront</div>
                      <div className="font-semibold text-blue-400">
                        {formatCurrency(pricing.reserved['1year'].allUpfront)}/hr
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {pricing.reserved['3year'] && (
              <div className="bg-dark-card p-3 rounded-lg">
                <div className="text-sm text-dark-text-muted mb-2">3 Year Term</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {pricing.reserved['3year'].noUpfront && (
                    <div>
                      <div className="text-dark-text-muted">No Upfront</div>
                      <div className="font-semibold text-purple-400">
                        {formatCurrency(pricing.reserved['3year'].noUpfront)}/hr
                      </div>
                    </div>
                  )}
                  {pricing.reserved['3year'].partialUpfront && (
                    <div>
                      <div className="text-dark-text-muted">Partial Upfront</div>
                      <div className="font-semibold text-purple-400">
                        {formatCurrency(pricing.reserved['3year'].partialUpfront)}/hr
                      </div>
                    </div>
                  )}
                  {pricing.reserved['3year'].allUpfront && (
                    <div>
                      <div className="text-dark-text-muted">All Upfront</div>
                      <div className="font-semibold text-purple-400">
                        {formatCurrency(pricing.reserved['3year'].allUpfront)}/hr
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      {pricing.breakdown && (
        <div className="space-y-2">
          <h4 className="font-medium text-dark-text-primary">Cost Breakdown</h4>
          <div className="space-y-1">
            {Object.entries(pricing.breakdown).map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-dark-text-secondary capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="font-medium text-dark-text-primary">
                  {formatCurrency(value as number)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Updated */}
      {pricing.lastUpdated && (
        <div className="text-xs text-dark-text-muted pt-2 border-t border-dark-border">
          Last updated: {new Date(pricing.lastUpdated).toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default PricingDisplay;
