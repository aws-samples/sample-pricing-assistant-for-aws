import React from 'react';
import { ExternalLink } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-dark-surface border-t border-dark-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-6">
          {/* About - Hidden on mobile */}
          <div className="hidden sm:block">
            <h3 className="text-sm font-semibold text-dark-text-primary mb-3">
              About AWS Pricing Assistant
            </h3>
            <p className="text-sm text-dark-text-muted">
              Conversational AWS cost estimation powered by Amazon Bedrock and Claude.
              Estimates are AI-generated and may be inaccurate — verify with the AWS
              Pricing Calculator before purchasing decisions.
            </p>
          </div>

          {/* Links - Simplified on mobile */}
          <div className="sm:block">
            <h3 className="text-xs sm:text-sm font-semibold text-dark-text-primary mb-1 sm:mb-3 hidden sm:block">
              Resources
            </h3>
            <div className="flex flex-row sm:flex-col space-x-4 sm:space-x-0 sm:space-y-2 justify-center sm:justify-start">
              <a
                href="https://aws.amazon.com/pricing/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm text-dark-text-muted hover:text-dark-text-primary transition-colors duration-200"
              >
                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>AWS Pricing</span>
              </a>
              <a
                href="https://calculator.aws/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm text-dark-text-muted hover:text-dark-text-primary transition-colors duration-200"
              >
                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Calculator</span>
              </a>
            </div>
          </div>

          {/* Status - Hidden on mobile */}
          <div className="hidden sm:block">
            <div className="flex items-center space-x-2 text-sm text-dark-text-muted">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Service Operational</span>
            </div>
          </div>
        </div>

        {/* Bottom Bar - Mobile only */}
        <div className="mt-2 pt-2 border-t border-dark-border sm:hidden">
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-2 text-xs text-dark-text-muted">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Service Operational</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
