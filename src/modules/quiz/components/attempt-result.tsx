import type { QuizAttemptView } from "../contracts/quiz";
import { MarkdownContent } from "./markdown-content";

export function AttemptResult({ attempt }: { attempt: QuizAttemptView }) {
  return (
    <section className="quiz-result">
      <header className="quiz-result-heading">
        <div>
          <span>第 {attempt.attemptNumber} 次作答</span>
          <h2>答题结果</h2>
        </div>
        {attempt.singleQuestionCount > 0 && (
          <strong>
            {attempt.singleCorrectCount} / {attempt.singleQuestionCount}
          </strong>
        )}
      </header>
      {attempt.reward ? (
        <p className="quiz-reward-banner">
          🎁 单选题全部答对奖励：{attempt.reward.ticketName} × {attempt.reward.quantity}
        </p>
      ) : (
        <p className="quiz-no-reward">本次没有获得新的答题奖励</p>
      )}
      <div className="quiz-result-list">
        {attempt.answers.map((answer, index) => {
          return (
            <article className="quiz-result-card" key={`${attempt.id}-${answer.questionId}`}>
              <h3>
                <span>{index + 1}</span>
                {answer.prompt}
              </h3>
              {answer.questionType === "single" ? (
                <div className="quiz-result-options" aria-label="完整题目选项">
                  {answer.options.map((option, optionIndex) => {
                    const isSelected = option.id === answer.selectedOptionId;
                    const stateClass = option.isCorrect
                      ? "correct"
                      : isSelected
                        ? "selected-wrong"
                        : "neutral";
                    return (
                      <div className={`quiz-result-option ${stateClass}`} key={option.id}>
                        <span className="quiz-result-option-marker">
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        <span>{option.content}</span>
                        <small>
                          {option.isCorrect && isSelected
                            ? "正确答案 · 你的选择"
                            : option.isCorrect
                              ? "正确答案"
                              : isSelected
                                ? "你的选择"
                                : ""}
                        </small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="quiz-text-answer">
                    <small>你的回答</small>
                    <p>{answer.textAnswer}</p>
                  </div>
                  {answer.referenceAnswer && (
                    <div className="quiz-reference-answer">
                      <small>参考答案</small>
                      <p>{answer.referenceAnswer}</p>
                    </div>
                  )}
                </>
              )}
              {answer.explanation && (
                <div className="quiz-explanation">
                  <div className="quiz-result-note-heading"><span>💡</span><strong>题目解析</strong></div>
                  <MarkdownContent>{answer.explanation}</MarkdownContent>
                </div>
              )}
              {answer.message && (
                <div className="quiz-message">
                  <div className="quiz-result-note-heading"><span>💌</span><strong>出题人的留言</strong></div>
                  <MarkdownContent>{answer.message}</MarkdownContent>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
