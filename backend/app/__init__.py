from pathlib import Path

from flask import Flask
from flask_cors import CORS

from .config import Config
from .extensions import db
from .routes.auth import auth_bp
from .routes.public import public_bp
from .routes.invoices import invoices_bp
from .routes.transactions import transactions_bp
from .routes.protocol import protocol_bp


def create_app(config_object: type[Config] = Config) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_object)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}})

    app.register_blueprint(public_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(invoices_bp)
    app.register_blueprint(transactions_bp)
    app.register_blueprint(protocol_bp)

    with app.app_context():
        db.create_all()

    return app
