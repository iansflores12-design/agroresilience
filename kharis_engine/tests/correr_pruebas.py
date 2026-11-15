"""Corre todas las pruebas y sale con 0 (todo bien) o 1 (algo fallo).

  python tests/correr_pruebas.py

Sale con os._exit para esquivar el fallo de apagado de PyTorch 2.14 + Python 3.15 con CUDA en Windows
(ver salir_limpio() en run_kharis.py).
"""
import os
import sys
import unittest
import warnings
from pathlib import Path

if __name__ == "__main__":
    warnings.simplefilter("ignore")
    aqui = Path(__file__).resolve().parent
    suite = unittest.defaultTestLoader.discover(str(aqui), pattern="test_*.py")
    res = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0 if res.wasSuccessful() else 1)
