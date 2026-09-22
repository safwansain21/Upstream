from fractions import Fraction as F
from datetime import timedelta
import pytest
from fixtures.networks import interval, START

def test_long_decimal_is_not_context_rounded():
    value = '123.123456789012345678901234567890123456789'
    assert interval(value,value).lower == value

def test_raw_background_propagation_and_compensation_regression():
    from upstream_engine.background import raw_enclosure, compensated_difference
    result = raw_enclosure(raw=(F(336),F(336)), temperature=(F(15),F(15)),
        alpha=(F('.018'),F('.022')), gain=(F(1),F(1)), offset=(F(0),F(0)),
        noise=(F(0),F(0)), visit=(F(0),F(0)))
    assert result == (F(336)/F('.82'), F(336)/F('.78'))
    shared = compensated_difference(F(440),F(420),F(15),F('.020'),(F('.018'),F('.022')),shared=True)
    independent = compensated_difference(F(440),F(420),F(15),F('.020'),(F('.018'),F('.022')),shared=False)
    assert shared == (F(16)/F('.82'),F(16)/F('.78'))
    assert independent[0] < shared[0] and independent[1] > shared[1]
    with pytest.raises(ValueError, match='positive'):
        raw_enclosure(raw=(F(1),F(2)), temperature=(F(-100),F(0)), alpha=(F('.02'),F('.02')),
                      gain=(F(1),F(1)), offset=(F(0),F(0)),noise=(F(0),F(0)),visit=(F(0),F(0)))

def test_chronological_evaluation_freezes_fit_and_counts_independent_events():
    from upstream_engine.background import HistoricalEnclosure, empirical_background, evaluate_coverage
    records = [HistoricalEnclosure('a','event-a',START,(F(10),F(20)),'same-domain'),
        HistoricalEnclosure('b','event-b',START+timedelta(days=1),(F(12),F(18)),'same-domain'),
        HistoricalEnclosure('c','event-c',START+timedelta(days=2),(F(11),F(19)),'same-domain'),
        HistoricalEnclosure('d','event-c',START+timedelta(days=2,minutes=1),(F(10),F(21)),'same-domain'),
        HistoricalEnclosure('e','event-d',START+timedelta(days=3),(F(11),F(19)),'same-domain')]
    fitted = empirical_background(records,cutoff=START+timedelta(days=2),scope='same-domain')
    assert fitted.enclosure == (F(10),F(20)) and fitted.training_ids == ('a','b')
    result = evaluate_coverage(fitted, records)
    assert result.independent_events == 2 and result.contained_events == 1 and result.sample_count == 3
    assert result.wilson_lower < .5 < result.wilson_upper
    assert 'not' in result.claim.lower()
