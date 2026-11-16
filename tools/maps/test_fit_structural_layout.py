"""Synthetic map tests for fitting direction, source coordinates and absent evidence."""

import numpy as np
from fit_structural_layout import controls, fit_segment
from svgpathtools import Line


def observed_wall():
    y, x = np.indices((100, 140))
    return np.exp(-0.5 * ((y + 0.5 - (30 + 0.04 * (x + 0.5))) / 1.4) ** 2)


def test_fit_retains_measured_tilt_instead_of_snapping_to_horizontal():
    fitted, evidence = fit_segment(
        Line(10 + 30j, 110 + 30j),
        observed_wall(),
        [1, 0, 0, 1, 0, 0],
        0.65,
        8,
    )
    assert evidence["fitted"]
    assert abs(fitted[0].imag - 30.4) < 0.2
    assert abs(fitted[1].imag - 34.4) < 0.2
    assert fitted[1].imag - fitted[0].imag > 3.5


def test_rotated_display_produces_the_same_fitted_source_wall():
    angle = -0.7
    rotation = np.exp(1j * angle)
    offset = 80 + 110j
    transform = [
        rotation.real,
        rotation.imag,
        -rotation.imag,
        rotation.real,
        offset.real,
        offset.imag,
    ]
    guide = Line((10 + 30j) * rotation + offset, (110 + 30j) * rotation + offset)
    fitted, evidence = fit_segment(guide, observed_wall(), transform, 0.65, 8)
    assert evidence["fitted"]
    source = (fitted - offset) / rotation
    assert abs(source[0] - (10 + 30.4j)) < 0.2
    assert abs(source[1] - (110 + 34.4j)) < 0.2


def test_unknown_space_does_not_attract_a_line_to_a_distant_wall():
    source = np.full((100, 140), 0.196)
    source[70:73, :] = 1
    guide = Line(10 + 30j, 110 + 30j)
    fitted, evidence = fit_segment(guide, source, [1, 0, 0, 1, 0, 0], 0.65, 8)
    assert not evidence["fitted"]
    np.testing.assert_array_equal(fitted, controls(guide))
