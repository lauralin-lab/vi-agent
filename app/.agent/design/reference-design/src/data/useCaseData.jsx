// Combine all use case batches into a single export
import batch1 from './useCases1.jsx';
import batch2 from './useCases2.jsx';
import batch3 from './useCases3.jsx';

const USE_CASES = [...batch1, ...batch2, ...batch3];

export default USE_CASES;
