import Sentiment from 'sentiment';

const sentiment = new Sentiment();

/**
 * Analyzes the sentiment of a review comment and rating
 * @param {string} comment - The review comment text
 * @param {number} rating - The star rating (1-5)
 * @returns {Object} - Sentiment analysis result
 */
export const analyzeSentiment = (comment, rating) => {
  // Combine comment and rating for analysis
  const textToAnalyze = comment || '';
  
  // Analyze sentiment of the comment
  const result = sentiment.analyze(textToAnalyze);
  
  // Determine sentiment label based on score and rating
  let sentimentLabel = 'neutral';
  let confidence = 0;
  
  // Combine rating and text sentiment for final decision
  // Rating is weighted more heavily
  const ratingWeight = 0.6;
  const textWeight = 0.4;
  
  // Normalize text score (-5 to +5) to 0-1 scale
  const normalizedTextScore = (result.score + 5) / 10; // Convert -5 to +5 range to 0-1
  const normalizedRating = (rating - 1) / 4; // Convert 1-5 range to 0-1
  
  // Combined score
  const combinedScore = (normalizedRating * ratingWeight) + (normalizedTextScore * textWeight);
  
  // Determine sentiment label
  if (rating >= 4 || (rating >= 3 && combinedScore > 0.6)) {
    sentimentLabel = 'positive';
    confidence = Math.min(100, Math.round(combinedScore * 100));
  } else if (rating <= 2 || (rating <= 3 && combinedScore < 0.4)) {
    sentimentLabel = 'negative';
    confidence = Math.min(100, Math.round((1 - combinedScore) * 100));
  } else {
    sentimentLabel = 'neutral';
    confidence = Math.min(100, Math.round(Math.abs(combinedScore - 0.5) * 200));
  }
  
  // If comment is empty, rely solely on rating
  if (!comment || comment.trim().length === 0) {
    if (rating >= 4) {
      sentimentLabel = 'positive';
      confidence = 90;
    } else if (rating <= 2) {
      sentimentLabel = 'negative';
      confidence = 90;
    } else {
      sentimentLabel = 'neutral';
      confidence = 70;
    }
  }
  
  return {
    label: sentimentLabel, // 'positive', 'negative', 'neutral'
    score: result.score, // Text sentiment score (-5 to +5)
    comparative: result.comparative, // Normalized score
    confidence: confidence, // Confidence percentage (0-100)
    tokens: result.tokens, // Words analyzed
    words: result.words, // Positive/negative words found
    positive: result.positive, // Positive words
    negative: result.negative, // Negative words
    rating: rating, // Original rating
    combinedScore: combinedScore // Combined score (0-1)
  };
};

/**
 * Determines if a review should be auto-approved based on sentiment
 * @param {Object} sentimentResult - Result from analyzeSentiment
 * @returns {boolean} - True if should be auto-approved
 */
export const shouldAutoApprove = (sentimentResult) => {
  // Auto-approve highly positive reviews (rating 5 with positive sentiment)
  if (sentimentResult.rating === 5 && sentimentResult.label === 'positive' && sentimentResult.confidence > 80) {
    return true;
  }
  
  // Auto-approve positive reviews with high confidence
  if (sentimentResult.label === 'positive' && sentimentResult.confidence > 85 && sentimentResult.rating >= 4) {
    return true;
  }
  
  return false;
};

