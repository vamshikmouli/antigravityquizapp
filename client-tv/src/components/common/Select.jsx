import { useState, useRef, useEffect } from 'react';
import './Select.css';

/**
 * Custom Dropdown Component
 * @param {Object} props
 * @param {Array} props.options - [{ value, label, icon }]
 * @param {any} props.value - current selected value
 * @param {Function} props.onChange - callback(value)
 * @param {string} props.label - optional label outside
 * @param {string} props.placeholder - placeholder if no value
 * @param {boolean} props.small - if true, use smaller padding/font
 */
function Select({ options, value, onChange, label, placeholder = 'Select option', small = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`custom-select-container ${small ? 'small' : ''}`} ref={containerRef}>
      {label && <label className="custom-select-label">{label}</label>}
      
      <div 
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="trigger-text">
          {selectedOption ? (
            <>
              {selectedOption.icon && <span className="opt-icon">{selectedOption.icon}</span>}
              <span className="opt-label">{selectedOption.label}</span>
            </>
          ) : (
            <span className="placeholder">{placeholder}</span>
          )}
        </span>
        <span className="arrow">{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div className="custom-select-options fade-in">
          {options.map(opt => (
            <div 
              key={opt.value}
              className={`custom-option ${value === opt.value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.icon && <span className="opt-icon">{opt.icon}</span>}
              <span className="opt-label">{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Select;
