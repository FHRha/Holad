import React from 'react';

interface UpdateModalProps {
    isOpen: boolean;
    onUpdate: () => void;
    onClose: () => void;
    version?: string;
    notes?: string;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ isOpen, onUpdate, onClose, version, notes }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content update-modal" style={contentStyle}>
                <h2>Доступно обновление</h2>
                {version && <p>Версия: {version}</p>}
                {notes && <p className="update-notes">{notes}</p>}
                
                <div className="modal-actions" style={actionsStyle}>
                    <button onClick={onUpdate} className="btn btn-primary" style={{ marginRight: '10px' }}>Обновить</button>
                    <button onClick={onClose} className="btn btn-secondary">Позже</button>
                </div>
            </div>
        </div>
    );
};

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
};

const contentStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    color: '#000',
    padding: '20px',
    borderRadius: '8px',
    maxWidth: '400px',
    width: '100%'
};

const actionsStyle: React.CSSProperties = {
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'flex-end'
};
