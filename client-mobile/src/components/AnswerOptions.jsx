const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function AnswerOptions({ options, onSelect, disabled, optionImages = [] }) {
  return (
    <div className="ph-options">
      {options.map((option, index) => (
        <button
          type="button"
          key={index}
          className={`ph-option o${index % 4}`}
          style={{ animationDelay: `${index * 70}ms` }}
          onClick={() => onSelect(option)}
          disabled={disabled}
        >
          <span className="ph-option-letter">{LETTERS[index]}</span>
          {optionImages[index] && <img src={optionImages[index]} alt="" className="ph-option-img" />}
          <span className="ph-option-text">{option}</span>
        </button>
      ))}
    </div>
  )
}

export default AnswerOptions
