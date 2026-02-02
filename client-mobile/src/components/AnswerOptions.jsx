import './AnswerOptions.css'

const optionColors = {
  0: 'var(--color-option-a)',
  1: 'var(--color-option-b)',
  2: 'var(--color-option-c)',
  3: 'var(--color-option-d)'
}

const optionLabels = ['A', 'B', 'C', 'D']
function AnswerOptions({ options, onSelect, disabled, optionImages = [] }) {
  return (
    <div className="answer-options">
      {options.map((option, index) => (
        <button
          key={index}
          className="answer-option"
          style={{
            '--option-color': optionColors[index],
            animationDelay: `${index * 100}ms`
          }}
          onClick={() => onSelect(option)}
          disabled={disabled}
        >
          <span className="option-label">{optionLabels[index]}.</span>
          <div className="option-content">
            {optionImages[index] && (
              <img src={optionImages[index]} alt="" className="option-image" />
            )}
            <span className="option-text">{option}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

export default AnswerOptions
